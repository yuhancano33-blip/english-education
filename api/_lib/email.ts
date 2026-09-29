interface EmailMessage {
  to: string[]
  subject: string
  text: string
}

/** Envía un email con la API REST de Resend (SPEC-004 §2). */
export async function sendEmail({ to, subject, text }: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    throw new Error('Faltan RESEND_API_KEY o EMAIL_FROM')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (!response.ok) {
    throw new Error(`Resend respondió ${response.status}`)
  }
}
