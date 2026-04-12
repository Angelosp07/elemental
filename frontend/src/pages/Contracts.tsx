import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatLondonTime } from '../utils/formatTime'

type Asset = {
  id: string
  symbol: string
  name: string
}

type Port = {
  code: string
  name: string
  country: string
}

type ProfileLookup = {
  id: string
  username: string
}

type ProfileJoin = {
  username: string | null
}

type ContractRow = {
  id: string
  buyer_id: string
  seller_id: string
  asset_symbol: string
  quantity_kg: number
  purity_pct: number
  price_per_kg: number
  currency: string
  delivery_terms: string
  origin_port: string
  destination_port: string
  status: 'draft' | 'signed' | 'completed' | 'cancelled'
  buyer_signed_at: string | null
  seller_signed_at: string | null
  created_at: string
  buyer: ProfileJoin | ProfileJoin[] | null
  seller: ProfileJoin | ProfileJoin[] | null
}

type ContractEvent = {
  id: string
  event_type: string
  note: string | null
  created_at: string
  actor: ProfileJoin | ProfileJoin[] | null
}

type AmendDraft = {
  quantity_kg: string
  purity_pct: string
  price_per_kg: string
}

const purityOptions = ['90', '92', '95', '97', '99', '99.5']
const deliveryTermsOptions = ['DAP', 'FOB', 'CIF']

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function statusBadgeClass(status: ContractRow['status']): string {
  if (status === 'signed') {
    return 'bg-green-500/20 text-green-400'
  }

  if (status === 'cancelled') {
    return 'bg-red-500/20 text-red-400'
  }

  if (status === 'draft') {
    return 'bg-amber-500/20 text-amber-400'
  }

  return 'bg-slate-500/20 text-slate-300'
}

export function Contracts() {
  const { user } = useAuth()

  const [assets, setAssets] = useState<Asset[]>([])
  const [ports, setPorts] = useState<Port[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [currentUsername, setCurrentUsername] = useState('User')

  const [counterpartyQuery, setCounterpartyQuery] = useState('')
  const [counterpartyResults, setCounterpartyResults] = useState<ProfileLookup[]>([])
  const [selectedCounterparty, setSelectedCounterparty] = useState<ProfileLookup | null>(null)
  const [counterpartyLoading, setCounterpartyLoading] = useState(false)

  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [purityPct, setPurityPct] = useState(purityOptions[0])
  const [deliveryTerms, setDeliveryTerms] = useState(deliveryTermsOptions[0])
  const [originPort, setOriginPort] = useState('')
  const [destinationPort, setDestinationPort] = useState('')
  const [quantityKg, setQuantityKg] = useState('')
  const [pricePerKg, setPricePerKg] = useState('')

  const [repositorySearch, setRepositorySearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [auditContractId, setAuditContractId] = useState<string | null>(null)
  const [auditEvents, setAuditEvents] = useState<ContractEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const [amendingContractId, setAmendingContractId] = useState<string | null>(null)
  const [amendDraft, setAmendDraft] = useState<AmendDraft>({
    quantity_kg: '',
    purity_pct: purityOptions[0],
    price_per_kg: '',
  })

  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadContracts = async () => {
    if (!user) {
      return
    }

    const { data, error: contractsError } = await supabase
      .from('contracts')
      .select(
        `
          id,
          buyer_id,
          seller_id,
          asset_symbol,
          quantity_kg,
          purity_pct,
          price_per_kg,
          currency,
          delivery_terms,
          origin_port,
          destination_port,
          status,
          buyer_signed_at,
          seller_signed_at,
          created_at,
          buyer:profiles!contracts_buyer_id_fkey(username),
          seller:profiles!contracts_seller_id_fkey(username)
        `
      )
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    if (contractsError) {
      throw new Error(contractsError.message)
    }

    setContracts((data ?? []) as ContractRow[])
  }

  const loadPageData = async () => {
    if (!user) {
      return
    }

    const [profileResult, assetsResult, portsResult] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
      supabase.from('assets').select('id, symbol, name').order('symbol'),
      supabase.from('ports').select('code, name, country').order('name'),
    ])

    const firstError = profileResult.error ?? assetsResult.error ?? portsResult.error

    if (firstError) {
      throw new Error(firstError.message)
    }

    if (profileResult.data?.username) {
      setCurrentUsername(profileResult.data.username)
    }

    const assetsData = (assetsResult.data ?? []) as Asset[]
    const portsData = (portsResult.data ?? []) as Port[]

    setAssets(assetsData)
    setPorts(portsData)

    if (assetsData.length > 0 && !selectedSymbol) {
      setSelectedSymbol(assetsData[0].symbol)
    }

    if (portsData.length > 0 && !originPort) {
      setOriginPort(portsData[0].code)
    }

    if (portsData.length > 0 && !destinationPort) {
      setDestinationPort(portsData[0].code)
    }

    await loadContracts()
  }

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        await loadPageData()
      } catch (caughtError) {
        if (!active) {
          return
        }

        const message =
          caughtError instanceof Error ? caughtError.message : 'Failed to load contracts page'
        setError(message)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      return
    }

    if (!counterpartyQuery.trim()) {
      setCounterpartyResults([])
      setCounterpartyLoading(false)
      return
    }

    let active = true
    setCounterpartyLoading(true)

    const handle = setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${counterpartyQuery.trim()}%`)
        .neq('id', user.id)
        .limit(10)

      if (!active) {
        return
      }

      if (searchError) {
        setCounterpartyResults([])
        setError(searchError.message)
        setCounterpartyLoading(false)
        return
      }

      setCounterpartyResults((data ?? []) as ProfileLookup[])
      setCounterpartyLoading(false)
    }, 300)

    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [counterpartyQuery, user])

  const filteredContracts = useMemo(() => {
    const query = repositorySearch.trim().toLowerCase()

    return contracts.filter((contract) => {
      if (statusFilter !== 'all' && contract.status !== statusFilter) {
        return false
      }

      if (!query) {
        return true
      }

      const buyerUsername = normalizeJoin(contract.buyer)?.username ?? ''
      const sellerUsername = normalizeJoin(contract.seller)?.username ?? ''

      return (
        contract.id.toLowerCase().includes(query) ||
        contract.asset_symbol.toLowerCase().includes(query) ||
        buyerUsername.toLowerCase().includes(query) ||
        sellerUsername.toLowerCase().includes(query)
      )
    })
  }, [contracts, repositorySearch, statusFilter])

  const userNotFound =
    counterpartyQuery.trim().length > 0 && !counterpartyLoading && counterpartyResults.length === 0

  const createContract = async () => {
    if (!user || !selectedCounterparty) {
      return
    }

    const parsedQuantity = Number(quantityKg)
    const parsedPurity = Number(purityPct)
    const parsedPrice = Number(pricePerKg)

    if (
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity <= 0 ||
      !Number.isFinite(parsedPurity) ||
      parsedPurity <= 0 ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice <= 0
    ) {
      setError('Please provide valid quantity, purity, and price values')
      return
    }

    setWorking(true)
    setError(null)

    const { error: createError } = await supabase.from('contracts').insert({
      buyer_id: user.id,
      seller_id: selectedCounterparty.id,
      asset_symbol: selectedSymbol,
      quantity_kg: parsedQuantity,
      purity_pct: parsedPurity,
      price_per_kg: parsedPrice,
      currency: 'USD',
      delivery_terms: deliveryTerms,
      origin_port: originPort,
      destination_port: destinationPort,
      status: 'draft',
    })

    if (createError) {
      setError(createError.message)
      setWorking(false)
      return
    }

    setSelectedCounterparty(null)
    setCounterpartyQuery('')
    setCounterpartyResults([])
    setQuantityKg('')
    setPricePerKg('')
    setPurityPct(purityOptions[0])

    await loadContracts()
    setWorking(false)
  }

  const signContract = async (contract: ContractRow) => {
    if (!user) {
      return
    }

    const isBuyer = contract.buyer_id === user.id
    const alreadySigned = isBuyer ? Boolean(contract.buyer_signed_at) : Boolean(contract.seller_signed_at)

    if (alreadySigned) {
      return
    }

    setWorking(true)
    setError(null)

    const now = new Date().toISOString()
    const updatePayload = isBuyer ? { buyer_signed_at: now } : { seller_signed_at: now }

    const { data: signedContract, error: signError } = await supabase
      .from('contracts')
      .update(updatePayload)
      .eq('id', contract.id)
      .select('id, buyer_signed_at, seller_signed_at')
      .maybeSingle()

    if (signError) {
      setError(signError.message)
      setWorking(false)
      return
    }

    if (signedContract?.buyer_signed_at && signedContract?.seller_signed_at) {
      const { error: statusError } = await supabase
        .from('contracts')
        .update({ status: 'signed' })
        .eq('id', contract.id)

      if (statusError) {
        setError(statusError.message)
      }
    }

    const { error: eventError } = await supabase.from('contract_events').insert({
      contract_id: contract.id,
      actor_id: user.id,
      event_type: 'signed',
      note: `Signed by ${currentUsername}`,
    })

    if (eventError) {
      setError(eventError.message)
    }

    await loadContracts()
    setWorking(false)
  }

  const openAmend = (contract: ContractRow) => {
    setAmendingContractId(contract.id)
    setAmendDraft({
      quantity_kg: String(contract.quantity_kg),
      purity_pct: String(contract.purity_pct),
      price_per_kg: String(contract.price_per_kg),
    })
  }

  const submitAmend = async (contractId: string) => {
    if (!user) {
      return
    }

    const nextQuantity = Number(amendDraft.quantity_kg)
    const nextPurity = Number(amendDraft.purity_pct)
    const nextPrice = Number(amendDraft.price_per_kg)

    if (
      !Number.isFinite(nextQuantity) ||
      nextQuantity <= 0 ||
      !Number.isFinite(nextPurity) ||
      nextPurity <= 0 ||
      !Number.isFinite(nextPrice) ||
      nextPrice <= 0
    ) {
      setError('Please provide valid amend values')
      return
    }

    setWorking(true)
    setError(null)

    const { error: amendError } = await supabase
      .from('contracts')
      .update({
        quantity_kg: nextQuantity,
        price_per_kg: nextPrice,
        purity_pct: nextPurity,
      })
      .eq('id', contractId)
      .eq('status', 'draft')

    if (amendError) {
      setError(amendError.message)
      setWorking(false)
      return
    }

    const { error: eventError } = await supabase.from('contract_events').insert({
      contract_id: contractId,
      actor_id: user.id,
      event_type: 'amended',
      note: `Amended by ${currentUsername}`,
    })

    if (eventError) {
      setError(eventError.message)
    }

    setAmendingContractId(null)
    await loadContracts()
    setWorking(false)
  }

  const openAudit = async (contractId: string) => {
    setAuditContractId(contractId)
    setAuditLoading(true)
    setError(null)

    const { data, error: auditError } = await supabase
      .from('contract_events')
      .select(
        `
          id,
          event_type,
          note,
          created_at,
          actor:profiles(username)
        `
      )
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true })

    if (auditError) {
      setError(auditError.message)
      setAuditEvents([])
      setAuditLoading(false)
      return
    }

    setAuditEvents((data ?? []) as ContractEvent[])
    setAuditLoading(false)
  }

  if (loading) {
    return <p className="text-slate-400">Loading contracts…</p>
  }

  return (
    <section className="space-y-4">
      {error ? (
        <p className="rounded-md border border-rose-800 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-lg font-semibold text-slate-100">Create Contract</h2>
          <p className="mt-1 text-xs text-slate-400">Counterparty search and draft terms</p>

          <div className="mt-4 space-y-3">
            <div>
              <input
                value={counterpartyQuery}
                onChange={(event) => {
                  setCounterpartyQuery(event.target.value)
                  setSelectedCounterparty(null)
                }}
                placeholder="Search counterparty username"
                className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              />

              {selectedCounterparty ? (
                <p className="mt-2 text-xs text-green-400">
                  Selected: @{selectedCounterparty.username}
                </p>
              ) : null}

              {counterpartyLoading ? (
                <p className="mt-2 text-xs text-slate-400">Searching users…</p>
              ) : null}

              {!counterpartyLoading && counterpartyResults.length > 0 ? (
                <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-md border border-slate-800 bg-slate-950/60 p-2">
                  {counterpartyResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => {
                        setSelectedCounterparty(result)
                        setCounterpartyQuery(result.username)
                        setCounterpartyResults([])
                      }}
                      className="w-full rounded px-2 py-1 text-left text-sm text-slate-200 hover:bg-slate-800"
                    >
                      @{result.username}
                    </button>
                  ))}
                </div>
              ) : null}

              {userNotFound ? <p className="mt-2 text-xs text-amber-300">User not found</p> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-400">
                Mineral
                <select
                  value={selectedSymbol}
                  onChange={(event) => setSelectedSymbol(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                >
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.symbol}>
                      {asset.symbol} · {asset.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-slate-400">
                Purity %
                <select
                  value={purityPct}
                  onChange={(event) => setPurityPct(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                >
                  {purityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-400">
                Delivery Terms
                <select
                  value={deliveryTerms}
                  onChange={(event) => setDeliveryTerms(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                >
                  {deliveryTermsOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-slate-400">
                Quantity (kg)
                <input
                  value={quantityKg}
                  onChange={(event) => setQuantityKg(event.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-400">
                Origin Port
                <select
                  value={originPort}
                  onChange={(event) => setOriginPort(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                >
                  {ports.map((port) => (
                    <option key={port.code} value={port.code}>
                      {port.name} ({port.code}) · {port.country}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-slate-400">
                Destination Port
                <select
                  value={destinationPort}
                  onChange={(event) => setDestinationPort(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                >
                  {ports.map((port) => (
                    <option key={port.code} value={port.code}>
                      {port.name} ({port.code}) · {port.country}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-400">
                Price (USD/kg)
                <input
                  value={pricePerKg}
                  onChange={(event) => setPricePerKg(event.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={!selectedCounterparty || working}
              onClick={createContract}
              className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              Create Contract
            </button>
          </div>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-lg font-semibold text-slate-100">Contract Repository</h2>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={repositorySearch}
              onChange={(event) => setRepositorySearch(event.target.value)}
              placeholder="Search by contract ID, symbol, or username"
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="draft">draft</option>
              <option value="signed">signed</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {filteredContracts.length === 0 ? (
              <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-400">
                No contracts match the current filters.
              </div>
            ) : (
              filteredContracts.map((contract) => {
                const buyerUsername = normalizeJoin(contract.buyer)?.username ?? 'Unknown'
                const sellerUsername = normalizeJoin(contract.seller)?.username ?? 'Unknown'
                const userIsBuyer = contract.buyer_id === user?.id
                const userSigned = userIsBuyer ? Boolean(contract.buyer_signed_at) : Boolean(contract.seller_signed_at)

                return (
                  <div
                    key={contract.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-mono text-sm font-semibold text-cyan-300">
                        {contract.asset_symbol} · {Number(contract.quantity_kg).toLocaleString()} kg
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusBadgeClass(contract.status)}`}
                      >
                        {contract.status}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-300">
                      {buyerUsername} ↔ {sellerUsername}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Purity {contract.purity_pct}% · {contract.currency} {Number(contract.price_per_kg).toFixed(2)} / kg
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Terms {contract.delivery_terms} · {contract.origin_port} → {contract.destination_port}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created: {formatLondonTime(contract.created_at)}
                    </p>

                    <div className="mt-2 grid gap-1 text-xs">
                      <p className={contract.buyer_signed_at ? 'text-green-400' : 'text-slate-500'}>
                        Buyer {contract.buyer_signed_at ? 'signed' : 'pending'}
                        {contract.buyer_signed_at ? ` · ${formatLondonTime(contract.buyer_signed_at)}` : ''}
                      </p>
                      <p className={contract.seller_signed_at ? 'text-green-400' : 'text-slate-500'}>
                        Seller {contract.seller_signed_at ? 'signed' : 'pending'}
                        {contract.seller_signed_at ? ` · ${formatLondonTime(contract.seller_signed_at)}` : ''}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={userSigned || contract.status === 'cancelled' || working}
                        onClick={() => signContract(contract)}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {userSigned ? 'Signed' : 'Sign'}
                      </button>

                      {contract.status === 'draft' ? (
                        <button
                          type="button"
                          onClick={() => openAmend(contract)}
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Amend
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => openAudit(contract.id)}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        View Audit
                      </button>
                    </div>

                    {amendingContractId === contract.id ? (
                      <div className="mt-3 grid gap-2 rounded-md border border-slate-800 bg-slate-900/70 p-3 md:grid-cols-4">
                        <input
                          value={amendDraft.quantity_kg}
                          onChange={(event) =>
                            setAmendDraft((current) => ({
                              ...current,
                              quantity_kg: event.target.value,
                            }))
                          }
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Qty (kg)"
                          className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
                        />
                        <input
                          value={amendDraft.purity_pct}
                          onChange={(event) =>
                            setAmendDraft((current) => ({
                              ...current,
                              purity_pct: event.target.value,
                            }))
                          }
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Purity %"
                          className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
                        />
                        <input
                          value={amendDraft.price_per_kg}
                          onChange={(event) =>
                            setAmendDraft((current) => ({
                              ...current,
                              price_per_kg: event.target.value,
                            }))
                          }
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Price"
                          className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => submitAmend(contract.id)}
                            className="rounded border border-indigo-500 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-900/20"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setAmendingContractId(null)}
                            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </article>
      </div>

      {auditContractId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Audit Trail · {auditContractId}</h3>
              <button
                type="button"
                onClick={() => {
                  setAuditContractId(null)
                  setAuditEvents([])
                }}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {auditLoading ? (
              <p className="text-sm text-slate-400">Loading audit events…</p>
            ) : auditEvents.length === 0 ? (
              <p className="text-sm text-slate-400">No audit events recorded.</p>
            ) : (
              <div className="space-y-2">
                {auditEvents.map((event) => {
                  const actorName = normalizeJoin(event.actor)?.username ?? 'Unknown'

                  return (
                    <div
                      key={event.id}
                      className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
                    >
                      <p className="text-xs text-slate-500">{formatLondonTime(event.created_at)}</p>
                      <p className="mt-1 text-xs text-slate-200">
                        {actorName} · {event.event_type}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{event.note ?? '—'}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
