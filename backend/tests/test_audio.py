"""Verifica duração, canais e memória limitada com áudio sintético local."""

import sys
import tempfile
import unittest
import wave
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from transcrevedor.audio import audio_blocks


class AudioTests(unittest.TestCase):
    def test_stereo_resample_and_partial_block(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "áudio com espaços.wav"
            rate = 44100
            samples = np.zeros((rate * 65, 2), dtype=np.int16)
            with wave.open(str(path), "wb") as output:
                output.setnchannels(2)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(samples.tobytes())
            blocks = list(audio_blocks(path))
            self.assertEqual(len(blocks), 3)
            self.assertEqual([b[0] for b in blocks], [0, 30, 60])
            self.assertAlmostEqual(sum(len(b[1]) for b in blocks) / 16000, 65, places=3)
            self.assertTrue(all(b[1].ndim == 1 and len(b[1]) <= 480000 for b in blocks))

    def test_corrupt_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.mp3"
            path.write_bytes(b"invalid")
            with self.assertRaises(Exception):
                list(audio_blocks(path))


class FormatTests(unittest.TestCase):
    def test_common_formats_decode(self):
        import av

        formats = [
            ("mp3", "libmp3lame"),
            ("flac", "flac"),
            ("m4a", "aac"),
            ("ogg", "libopus"),
            ("opus", "libopus"),
            ("wma", "wmav2"),
            ("aiff", "pcm_s16be"),
            ("mp4", "aac"),
            ("mkv", "flac"),
            ("webm", "libopus"),
        ]
        with tempfile.TemporaryDirectory() as directory:
            for extension, codec in formats:
                with self.subTest(extension=extension):
                    path = Path(directory) / f"áudio.{extension}"
                    with av.open(str(path), "w") as output:
                        stream = output.add_stream(codec, rate=48000)
                        stream.layout = "mono"
                        stream.bit_rate = 128000
                        frame = av.AudioFrame.from_ndarray(
                            np.zeros((1, 48000), dtype=np.int16),
                            format="s16",
                            layout="mono",
                        )
                        frame.sample_rate = 48000
                        frame.pts = 0
                        for packet in stream.encode(frame):
                            output.mux(packet)
                        for packet in stream.encode(None):
                            output.mux(packet)
                    blocks = list(audio_blocks(path))
                    self.assertGreater(sum(len(item[1]) for item in blocks), 8000)
