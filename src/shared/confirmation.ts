/** Pedidos de decisão não contêm credenciais e só podem ser respondidos pela janela principal. */
export interface Confirmation {
  id: string
  title: string
  description: string
  action: string
}
export type AskConfirmation = (input: Omit<Confirmation, 'id'>) => Promise<boolean>
