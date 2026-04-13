import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatLondonTime } from '../utils/formatTime'

type ProfileLite = {
  id: string
  username: string | null
}

type RecentMessageRow = {
  id: string
  message: string
  created_at: string
  sender: ProfileLite | ProfileLite[] | null
  receiver: ProfileLite | ProfileLite[] | null
}

type ThreadMessageRow = {
  id: string
  message: string
  created_at: string
  sender: ProfileLite | ProfileLite[] | null
}

type ChatMessage = {
  id: string
  message: string
  createdAt: string
  senderId: string
  senderUsername: string
}

type RecentConversation = {
  partnerId: string
  partnerUsername: string
  lastMessage: string
  lastMessageAt: string
}

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeUsernameQuery(value: string): string {
  return value.replace(/^@+/, '').trim().replace(/\s+/g, ' ')
}

export function Chat() {
  const { user } = useAuth()

  const [currentUsername, setCurrentUsername] = useState('Trader')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileLite[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)

  const [selectedPartner, setSelectedPartner] = useState<ProfileLite | null>(null)
  const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([])
  const [unreadPartnerIds, setUnreadPartnerIds] = useState<Record<string, boolean>>({})

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const loadCurrentUsername = useCallback(async () => {
    if (!user) {
      return
    }

    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()

    setCurrentUsername(data?.username ?? 'Trader')
  }, [user])

  const loadRecentConversations = useCallback(async () => {
    if (!user) {
      return
    }

    const { data, error: recentError } = await supabase
      .from('chat_messages')
      .select(
        `
          id,
          message,
          created_at,
          sender:profiles!chat_messages_sender_id_fkey(id, username),
          receiver:profiles!chat_messages_receiver_id_fkey(id, username)
        `
      )
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (recentError) {
      setError(recentError.message)
      return
    }

    const rows = (data ?? []) as RecentMessageRow[]
    const dedup = new Map<string, RecentConversation>()

    for (const row of rows) {
      const sender = normalizeJoin(row.sender)
      const receiver = normalizeJoin(row.receiver)

      if (!sender?.id || !receiver?.id) {
        continue
      }

      const partner = sender.id === user.id ? receiver : sender

      if (!partner.id || dedup.has(partner.id)) {
        continue
      }

      dedup.set(partner.id, {
        partnerId: partner.id,
        partnerUsername: partner.username ?? 'Unknown',
        lastMessage: row.message,
        lastMessageAt: row.created_at,
      })
    }

    setRecentConversations(Array.from(dedup.values()))
  }, [user])

  const loadMessages = useCallback(
    async (partnerId: string) => {
      if (!user) {
        return
      }

      const { data, error: threadError } = await supabase
        .from('chat_messages')
        .select(
          `
            id,
            message,
            created_at,
            sender:profiles!chat_messages_sender_id_fkey(id, username)
          `
        )
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),` +
            `and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true })
        .limit(100)

      if (threadError) {
        setError(threadError.message)
        return
      }

      const normalized = ((data ?? []) as ThreadMessageRow[]).map((row) => {
        const sender = normalizeJoin(row.sender)

        return {
          id: row.id,
          message: row.message,
          createdAt: row.created_at,
          senderId: sender?.id ?? '',
          senderUsername: sender?.username ?? 'Unknown',
        }
      })

      setMessages(normalized)
    },
    [user]
  )

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const init = async () => {
      setLoading(true)
      setError(null)

      try {
        await Promise.all([loadCurrentUsername(), loadRecentConversations()])
      } catch (caughtError) {
        if (!active) {
          return
        }

        const message = caughtError instanceof Error ? caughtError.message : 'Failed to load chat'
        setError(message)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void init()

    const channel = supabase
      .channel('chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const incoming = payload.new as {
            id: string
            sender_id: string
            receiver_id: string
            message: string
            created_at: string
          }

          void loadRecentConversations()

          if (!selectedPartner || incoming.sender_id !== selectedPartner.id) {
            setUnreadPartnerIds((current) => ({ ...current, [incoming.sender_id]: true }))
            return
          }

          setMessages((current) => [
            ...current,
            {
              id: incoming.id,
              message: incoming.message,
              createdAt: incoming.created_at,
              senderId: incoming.sender_id,
              senderUsername: selectedPartner.username ?? 'Unknown',
            },
          ])
        }
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [loadCurrentUsername, loadRecentConversations, selectedPartner, user])

  useEffect(() => {
    if (!selectedPartner) {
      setMessages([])
      return
    }

    void loadMessages(selectedPartner.id)
  }, [loadMessages, selectedPartner])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!user) {
      return
    }

    const query = normalizeUsernameQuery(searchQuery)

    if (!query) {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      setShowSearchDropdown(false)
      return
    }

    if (query.length < 2) {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      setShowSearchDropdown(true)
      return
    }

    let active = true
    setSearchLoading(true)
    setSearchError(null)
    setShowSearchDropdown(true)

    const timer = setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${query}%`)
        .neq('id', user.id)
        .not('username', 'is', null)
        .order('username')
        .limit(10)

      if (!active) {
        return
      }

      if (searchError) {
        console.error('Search error:', searchError.message)
        setSearchError('Search failed. Please try again.')
        setSearchResults([])
        setSearchLoading(false)
        return
      }

      setSearchResults((data ?? []) as ProfileLite[])
      setSearchError(null)
      setSearchLoading(false)
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [searchQuery, user])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!searchRef.current) {
        return
      }

      if (!searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedLastMessageTime = useMemo(
    () => (messages.length > 0 ? messages[messages.length - 1].createdAt : null),
    [messages]
  )

  const canSend = Boolean(selectedPartner && messageText.trim().length > 0 && !sending)

  const handleSend = async () => {
    if (!user || !selectedPartner || !messageText.trim()) {
      return
    }

    const trimmed = messageText.trim()
    const now = new Date().toISOString()

    setSending(true)
    setError(null)

    setMessages((current) => [
      ...current,
      {
        id: `temp-${crypto.randomUUID()}`,
        message: trimmed,
        createdAt: now,
        senderId: user.id,
        senderUsername: currentUsername,
      },
    ])

    setMessageText('')

    const { error: sendError } = await supabase.from('chat_messages').insert({
      sender_id: user.id,
      receiver_id: selectedPartner.id,
      message: trimmed,
    })

    if (sendError) {
      setError(sendError.message)
      setSending(false)
      return
    }

    setRecentConversations((current) => {
      const others = current.filter((item) => item.partnerId !== selectedPartner.id)
      return [
        {
          partnerId: selectedPartner.id,
          partnerUsername: selectedPartner.username ?? 'Unknown',
          lastMessage: trimmed,
          lastMessageAt: now,
        },
        ...others,
      ]
    })

    setSending(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading chat…</p>
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">Chat</h1>
        <p className="text-sm text-gray-500 mb-6">Realtime direct messaging with counterparties.</p>
      </div>

      {error ? (
        <p className="rounded-md border border-rose-800 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="flex gap-4">
        <aside className="w-80 shrink-0 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Conversations</h2>

          <div ref={searchRef} className="mt-3">
            <input
              value={searchQuery}
              onFocus={() => {
                if (normalizeUsernameQuery(searchQuery).length > 0) {
                  setShowSearchDropdown(true)
                }
              }}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setSearchError(null)
              }}
              placeholder="Type username..."
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            />

            {selectedPartner ? (
              <p className="mt-2 inline-flex rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-300">
                Selected: {selectedPartner.username ?? 'Unknown'}
              </p>
            ) : null}

            {showSearchDropdown ? (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/60 p-2">
                {searchLoading ? <p className="text-xs text-slate-400">Searching...</p> : null}
                {!searchLoading && normalizeUsernameQuery(searchQuery).length < 2 ? (
                  <p className="text-xs text-slate-500">Type at least 2 characters</p>
                ) : null}
                {!searchLoading && searchError ? (
                  <p className="text-xs text-rose-300">{searchError}</p>
                ) : null}
                {!searchLoading && !searchError && searchResults.length === 0 && normalizeUsernameQuery(searchQuery).length >= 2 ? (
                  <p className="text-xs text-slate-400">No users found</p>
                ) : null}
                {!searchLoading && !searchError
                  ? searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => {
                          setSelectedPartner(result)
                          setUnreadPartnerIds((current) => {
                            const clone = { ...current }
                            delete clone[result.id]
                            return clone
                          })
                          setSearchQuery(result.username ?? '')
                          setSearchResults([])
                          setShowSearchDropdown(false)
                          setSearchError(null)
                        }}
                        className="w-full rounded px-2 py-1 text-left text-sm text-slate-200 hover:bg-slate-800"
                      >
                        {result.username ?? 'Unknown'}
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
          </div>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent</h3>
          <div className="mt-2 space-y-1">
            {recentConversations.length === 0 ? (
              <p className="text-xs text-slate-500">No conversations yet.</p>
            ) : (
              recentConversations.map((conversation) => (
                <button
                  key={conversation.partnerId}
                  type="button"
                  onClick={() => {
                    setSelectedPartner({
                      id: conversation.partnerId,
                      username: conversation.partnerUsername,
                    })
                    setUnreadPartnerIds((current) => {
                      const clone = { ...current }
                      delete clone[conversation.partnerId]
                      return clone
                    })
                  }}
                  className={`w-full rounded-md border border-slate-800 px-3 py-2 text-left hover:bg-white/5 ${
                    selectedPartner?.id === conversation.partnerId ? 'bg-white/10' : 'bg-slate-950/40'
                  }`}
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    {conversation.partnerUsername}
                    {unreadPartnerIds[conversation.partnerId] ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" aria-label="Unread conversation" />
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-slate-400">{conversation.lastMessage}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatLondonTime(conversation.lastMessageAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        <article className="flex-1 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          {!selectedPartner ? (
            <div className="flex h-[620px] items-center justify-center rounded-md border border-slate-800 bg-slate-950/40">
              <p className="text-slate-400">Select a user to start chatting</p>
            </div>
          ) : (
            <div className="flex h-[620px] flex-col">
              <div className="mb-3 flex items-start justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Chat with {selectedPartner.username ?? 'Unknown'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedLastMessageTime
                      ? `Last message: ${formatLondonTime(selectedLastMessageTime)}`
                      : 'No messages yet'}
                  </p>
                </div>

                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                  Auto refresh 3.5s
                </span>
              </div>

              <div className="h-[470px] overflow-y-auto rounded-md border border-slate-800 bg-slate-950/40 p-3">
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-sm text-slate-500">No messages in this conversation yet.</p>
                  ) : (
                    messages.map((message) => {
                      const isMine = message.senderId === user?.id

                      return (
                        <div key={message.id} className={isMine ? 'text-right' : 'text-left'}>
                          <div
                            className={
                              isMine
                                ? 'bg-blue-600 text-white rounded-2xl rounded-tl-sm px-4 py-2 max-w-xs ml-auto'
                                : 'bg-gray-700 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-xs'
                            }
                          >
                            {message.message}
                          </div>
                          <p className="mt-1 text-xs text-gray-400">{formatLondonTime(message.createdAt)}</p>
                        </div>
                      )
                    })
                  )}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/40 p-3">
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value.slice(0, 2000))}
                  onKeyDown={handleKeyDown}
                  maxLength={2000}
                  rows={3}
                  placeholder="Type your message..."
                  className="w-full resize-none rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-slate-500">{messageText.length}/2000</p>
                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={() => void handleSend()}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      canSend
                        ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                        : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
