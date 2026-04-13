import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatLondonTime } from '../utils/formatTime'

type NotificationRow = {
  id: string
  type: string
  title: string
  body: string
  related_id: string | null
  is_read: boolean
  created_at: string
}

export function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const loadNotifications = async () => {
      const { data, error: loadError } = await supabase
        .from('notifications')
        .select('id, type, title, body, related_id, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (!active) {
        return
      }

      if (loadError) {
        setError(loadError.message)
        return
      }

      setNotifications((data ?? []) as NotificationRow[])
    }

    void loadNotifications()

    const channel = supabase
      .channel(`notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow
          setNotifications((current) => [row, ...current].slice(0, 20))
        }
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!panelRef.current) {
        return
      }

      if (!panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications]
  )

  const markAsRead = async (notificationId: string) => {
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              is_read: true,
            }
          : item
      )
    )
  }

  const markAllAsRead = async () => {
    if (!user) {
      return
    }

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:bg-slate-800"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-96 rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Notifications</h3>
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs text-indigo-300 hover:text-indigo-200"
            >
              Mark all as read
            </button>
          </div>

          {error ? <p className="mb-2 text-xs text-rose-300">{error}</p> : null}

          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500">No notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    if (!notification.is_read) {
                      void markAsRead(notification.id)
                    }
                  }}
                  className="w-full rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-left hover:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-100">{notification.title}</p>
                    {!notification.is_read ? (
                      <span className="mt-1 h-2 w-2 rounded-full bg-blue-400" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{notification.body}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatLondonTime(notification.created_at)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
