"""Descoberta de capacidades e métricas; NVML é opcional em CPU."""

import os
import threading
import psutil
from .protocol import emit

# A mesma ordem PCI é aplicada ao CUDA e à identificação NVML das placas.
os.environ["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"


def nvml_devices():
    """Retorna placas físicas NVIDIA; ausência do driver não impede CPU."""
    try:
        import pynvml as nv

        nv.nvmlInit()
        handles = [
            nv.nvmlDeviceGetHandleByIndex(i) for i in range(nv.nvmlDeviceGetCount())
        ]
        handles.sort(key=lambda handle: nv.nvmlDeviceGetPciInfo(handle).busId)
        visible = os.environ.get("CUDA_VISIBLE_DEVICES")
        if visible is not None:
            selected = []
            for token in visible.split(","):
                token = token.strip()
                try:
                    handle = (
                        handles[int(token)]
                        if token.isdigit()
                        else nv.nvmlDeviceGetHandleByUUID(token)
                    )
                    selected.append(handle)
                except Exception:
                    break
            handles = selected
        return nv, handles
    except Exception:
        return None, []


def processor_name():
    """Obtém o nome real sem inferir desempenho pelo número do modelo."""
    try:
        if os.name == "nt":
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            ) as key:
                return winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        from pathlib import Path

        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except (OSError, ValueError):
        pass
    return "Processador não identificado"


def gpu_process_metrics(nv, handle, pids, since):
    """Valores não fornecidos pelo driver são nulos, nunca zeros inventados."""
    app_memory, app_usage, latest = None, None, since
    try:
        records = [
            *nv.nvmlDeviceGetComputeRunningProcesses(handle),
            *nv.nvmlDeviceGetGraphicsRunningProcesses(handle),
        ]
        owned = {r.pid: r.usedGpuMemory for r in records if r.pid in pids}
        if all(
            isinstance(value, int) and 0 <= value < 2**60 for value in owned.values()
        ):
            app_memory = sum(owned.values())
    except Exception:
        pass
    try:
        samples = nv.nvmlDeviceGetProcessUtilization(handle, since)
        by_pid = {}
        for sample in samples:
            latest = max(latest, sample.timeStamp)
            if sample.pid in pids and (
                sample.pid not in by_pid
                or sample.timeStamp > by_pid[sample.pid].timeStamp
            ):
                by_pid[sample.pid] = sample
        app_usage = min(100, sum(s.smUtil for s in by_pid.values()))
    except Exception:
        pass
    return app_memory, app_usage, latest


def capabilities():
    import ctranslate2 as ct

    nv, handles = nvml_devices()
    devices = [
        {
            "id": "cpu",
            "name": "CPU",
            "computeTypes": sorted(ct.get_supported_compute_types("cpu")),
        }
    ]
    # O índice CUDA é consultado no runtime; NVML fornece apenas nome e métricas.
    for index in range(ct.get_cuda_device_count()):
        try:
            name = (
                nv.nvmlDeviceGetName(handles[index])
                if index < len(handles)
                else f"NVIDIA CUDA {index}"
            )
            if isinstance(name, bytes):
                name = name.decode()
            devices.append(
                {
                    "id": f"cuda:{index}",
                    "name": name,
                    "computeTypes": sorted(
                        ct.get_supported_compute_types("cuda", index)
                    ),
                }
            )
        except Exception:
            continue
    return {
        "devices": devices,
        "threads": os.cpu_count() or 1,
        "cpuName": processor_name(),
        "totalRam": psutil.virtual_memory().total,
    }


def monitor(stop: threading.Event):
    """Amostra sistema e árvore do aplicativo; métricas NVIDIA dependem do driver."""
    nv, handles = nvml_devices()
    processes = {}
    gpu_since = {}
    while not stop.wait(1):
        try:
            root = psutil.Process(os.getppid())
            current = [root, *root.children(recursive=True)]
            cpu, ram = 0.0, 0
            memory_kind = "private"
            for proc in current:
                try:
                    tracked = processes.setdefault(proc.pid, proc)
                    cpu += tracked.cpu_percent() / (os.cpu_count() or 1)
                    try:
                        ram += tracked.memory_full_info().uss
                    except (psutil.Error, AttributeError):
                        ram += tracked.memory_info().rss
                        memory_kind = "rss"
                except psutil.Error:
                    pass
            processes = {p.pid: processes[p.pid] for p in current if p.pid in processes}
            gpus = []
            for i, handle in enumerate(handles):
                try:
                    memory = nv.nvmlDeviceGetMemoryInfo(handle)
                    app_used, app_usage, timestamp = gpu_process_metrics(
                        nv, handle, processes.keys(), gpu_since.get(i, 0)
                    )
                    gpu_since[i] = timestamp
                    gpus.append(
                        {
                            "index": i,
                            "appUsed": app_used,
                            "appUsage": app_usage,
                            "usage": nv.nvmlDeviceGetUtilizationRates(handle).gpu,
                            "used": memory.used,
                            "total": memory.total,
                        }
                    )
                except Exception:
                    pass
            memory = psutil.virtual_memory()
            emit(
                "metrics",
                cpu=psutil.cpu_percent(),
                appCpu=cpu,
                ram=memory.used,
                totalRam=memory.total,
                appRam=ram,
                memoryKind=memory_kind,
                coreRam=psutil.Process().memory_info().rss,
                gpus=gpus,
            )
        except psutil.Error:
            continue
