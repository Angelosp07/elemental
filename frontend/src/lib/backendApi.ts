const backendBaseUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

type RequestConfig = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

async function request<T>(path: string, config: RequestConfig = {}): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    method: config.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json()) as { data?: T; error?: string }

  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed')
  }

  return payload.data as T
}

export const backendApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
