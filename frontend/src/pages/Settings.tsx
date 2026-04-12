import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

type SettingsState = {
  emailAlerts: boolean
  pushAlerts: boolean
  darkTheme: boolean
}

export function Settings() {
  const { user } = useAuth()

  const [username, setUsername] = useState('Trader')
  const [email, setEmail] = useState('')
  const [settings, setSettings] = useState<SettingsState>({
    emailAlerts: true,
    pushAlerts: true,
    darkTheme: true,
  })
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const loadProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) {
        return
      }

      setUsername(data?.username ?? 'Trader')
      setEmail(user.email ?? '')
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [user])

  const toggleSetting = (key: keyof SettingsState) => {
    setSavedMessage(null)
    setSettings((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const handleSave = () => {
    setSavedMessage('Settings saved locally for this session.')
  }

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
        <p className="mt-1 text-sm text-slate-400">Manage your profile visibility and notification preferences.</p>
      </article>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Account</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400">Username</label>
              <input
                value={username}
                readOnly
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Email</label>
              <input
                value={email}
                readOnly
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
              />
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Preferences</h3>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => toggleSetting('emailAlerts')}
              className="flex w-full items-center justify-between rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              <span>Email alerts</span>
              <span className={settings.emailAlerts ? 'text-green-400' : 'text-slate-500'}>
                {settings.emailAlerts ? 'On' : 'Off'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => toggleSetting('pushAlerts')}
              className="flex w-full items-center justify-between rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              <span>Push alerts</span>
              <span className={settings.pushAlerts ? 'text-green-400' : 'text-slate-500'}>
                {settings.pushAlerts ? 'On' : 'Off'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => toggleSetting('darkTheme')}
              className="flex w-full items-center justify-between rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              <span>Dark theme</span>
              <span className={settings.darkTheme ? 'text-green-400' : 'text-slate-500'}>
                {settings.darkTheme ? 'On' : 'Off'}
              </span>
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Save Preferences
            </button>
            {savedMessage ? <span className="text-xs text-emerald-300">{savedMessage}</span> : null}
          </div>
        </article>
      </div>
    </section>
  )
}
