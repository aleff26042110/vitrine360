export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')
  if (password !== confirmation) throw new Error('As senhas não coincidem.')
}
