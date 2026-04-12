export function formatLondonDateTime(timestamp: string | Date): string {
  return new Date(timestamp).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
  })
}

export function formatLondonTime(timestamp: string | Date): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
  })
}
