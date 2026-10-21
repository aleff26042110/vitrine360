/** Translate provider values at the presentation boundary. */
export function processingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: 'Na fila', pending: 'Aguardando', created: 'Criado',
    running: 'Processando', processing: 'Processando', uploading: 'Enviando',
    succeeded: 'Concluído', completed: 'Concluído', failed: 'Falhou',
    cancelled: 'Cancelado', timed_out: 'Tempo esgotado',
  }
  return labels[status] ?? 'Estado indisponível'
}

export function accountErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  const labels: Record<string, string> = {
    invalid_credentials: 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
    user_already_exists: 'Já existe uma conta com este e-mail.',
    email_exists: 'Já existe uma conta com este e-mail.',
    signup_disabled: 'O cadastro de novas contas está indisponível no momento.',
    weak_password: 'Escolha uma senha mais forte, com pelo menos 8 caracteres.',
    same_password: 'Escolha uma senha diferente da senha atual.',
    over_email_send_rate_limit: 'Aguarde alguns minutos antes de solicitar outro e-mail.',
    over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    otp_expired: 'O link expirou. Solicite um novo link de recuperação.',
    session_expired: 'Sua sessão expirou. Entre novamente.',
  }
  return typeof code === 'string' && labels[code] ? labels[code] : 'Não foi possível concluir a solicitação. Confira sua conexão e tente novamente.'
}
