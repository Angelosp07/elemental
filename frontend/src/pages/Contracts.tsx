import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatLondonTime } from '../utils/formatTime'
import { createNotification } from '../utils/notifications'

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
  inspection_company: string | null
  inspection_status: 'not_started' | 'pending' | 'passed' | 'failed'
  inspection_note: string | null
  inspected_at: string | null
  buyer_signed_at: string | null
  seller_signed_at: string | null
  created_at: string
  buyer: ProfileJoin | ProfileJoin[] | null
  seller: ProfileJoin | ProfileJoin[] | null
}

type ContractDocument = {
  id: string
  contract_id: string
  uploaded_by: string
  document_type:
    | 'certificate_of_analysis'
    | 'bill_of_lading'
    | 'commercial_invoice'
    | 'packing_list'
    | 'certificate_of_origin'
    | 'insurance_certificate'
    | 'other'
  file_name: string
  storage_path: string
  created_at: string
  uploader: ProfileJoin | ProfileJoin[] | null
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

type VerificationDraft = {
  inspection_company: string
  inspection_status: 'not_started' | 'pending' | 'passed' | 'failed'
  inspection_note: string
}

const purityOptions = ['90', '92', '95', '97', '99', '99.5']
const deliveryTermsOptions = ['DAP', 'FOB', 'CIF']
const documentTypeOptions: Array<ContractDocument['document_type']> = [
  'certificate_of_analysis',
  'bill_of_lading',
  'commercial_invoice',
  'packing_list',
  'certificate_of_origin',
  'insurance_certificate',
  'other',
]

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeUsernameQuery(value: string): string {
  return value.replace(/^@+/, '').trim().replace(/\s+/g, ' ')
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

function inspectionBadgeConfig(status: ContractRow['inspection_status']) {
  if (status === 'passed') {
    return { label: 'Inspection passed', className: 'bg-green-500/20 text-green-400' }
  }

  if (status === 'failed') {
    return { label: 'Inspection failed', className: 'bg-red-500/20 text-red-400' }
  }

  if (status === 'pending') {
    return { label: 'Inspection in progress', className: 'bg-amber-500/20 text-amber-400' }
  }

  return { label: 'Inspection pending', className: 'bg-slate-500/20 text-slate-300' }
}

function formatDocumentType(value: ContractDocument['document_type']): string {
  return value.replace(/_/g, ' ')
}

export function Contracts() {
  const { user } = useAuth()

  const [assets, setAssets] = useState<Asset[]>([])
  const [ports, setPorts] = useState<Port[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [documentsByContract, setDocumentsByContract] = useState<Record<string, ContractDocument[]>>({})
  const [currentUsername, setCurrentUsername] = useState('User')

  const [counterpartyQuery, setCounterpartyQuery] = useState('')
  const [counterpartyResults, setCounterpartyResults] = useState<ProfileLookup[]>([])
  const [selectedCounterparty, setSelectedCounterparty] = useState<ProfileLookup | null>(null)
  const [counterpartyLoading, setCounterpartyLoading] = useState(false)
  const [counterpartySearchError, setCounterpartySearchError] = useState<string | null>(null)
  const [showCounterpartyDropdown, setShowCounterpartyDropdown] = useState(false)
  const counterpartySearchRef = useRef<HTMLDivElement>(null)

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
  const [verificationDrafts, setVerificationDrafts] = useState<Record<string, VerificationDraft>>({})
  const [uploadTypeByContract, setUploadTypeByContract] = useState<
    Record<string, ContractDocument['document_type']>
  >({})
  const [storageReady, setStorageReady] = useState(true)

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
          inspection_company,
          inspection_status,
          inspection_note,
          inspected_at,
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

    const loadedContracts = (data ?? []) as ContractRow[]
    setContracts(loadedContracts)
    setVerificationDrafts((current) => {
      const next = { ...current }

      for (const contract of loadedContracts) {
        if (next[contract.id]) {
          continue
        }

        next[contract.id] = {
          inspection_company: contract.inspection_company ?? '',
          inspection_status: contract.inspection_status,
          inspection_note: contract.inspection_note ?? '',
        }
      }

      return next
    })

    if (loadedContracts.length > 0) {
      const contractIds = loadedContracts.map((contract) => contract.id)
      const { data: docsData, error: docsError } = await supabase
        .from('contract_documents')
        .select(
          `
            id,
            contract_id,
            uploaded_by,
            document_type,
            file_name,
            storage_path,
            created_at,
            uploader:profiles!contract_documents_uploaded_by_fkey(username)
          `
        )
        .in('contract_id', contractIds)
        .order('created_at', { ascending: false })

      if (docsError) {
        setDocumentsByContract({})
        return
      }

      const grouped: Record<string, ContractDocument[]> = {}
      for (const document of (docsData ?? []) as ContractDocument[]) {
        if (!grouped[document.contract_id]) {
          grouped[document.contract_id] = []
        }
        grouped[document.contract_id].push(document)
      }
      setDocumentsByContract(grouped)
    } else {
      setDocumentsByContract({})
    }
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
    const checkStorage = async () => {
      const { data, error: bucketsError } = await supabase.storage.listBuckets()

      if (bucketsError) {
        setStorageReady(false)
        return
      }

      const exists = (data ?? []).some((bucket) => bucket.id === 'contract-documents')
      setStorageReady(exists)
    }

    void checkStorage()
  }, [])

  useEffect(() => {
    if (!user) {
      return
    }

    const query = normalizeUsernameQuery(counterpartyQuery)

    if (!query) {
      setCounterpartyResults([])
      setCounterpartyLoading(false)
      setCounterpartySearchError(null)
      setShowCounterpartyDropdown(false)
      return
    }

    if (query.length < 2) {
      setCounterpartyResults([])
      setCounterpartyLoading(false)
      setCounterpartySearchError(null)
      setShowCounterpartyDropdown(true)
      return
    }

    let active = true
    setCounterpartyLoading(true)
    setCounterpartySearchError(null)
    setShowCounterpartyDropdown(true)

    const handle = setTimeout(async () => {
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
        setCounterpartyResults([])
        setCounterpartySearchError('Search failed. Please try again.')
        setCounterpartyLoading(false)
        return
      }

      setCounterpartyResults((data ?? []) as ProfileLookup[])
      setCounterpartySearchError(null)
      setCounterpartyLoading(false)
    }, 300)

    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [counterpartyQuery, user])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!counterpartySearchRef.current) {
        return
      }

      if (!counterpartySearchRef.current.contains(event.target as Node)) {
        setShowCounterpartyDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const notifyIfOtherParty = async (
    recipientId: string,
    type: string,
    title: string,
    body: string,
    relatedId?: string
  ) => {
    if (!user || recipientId === user.id) {
      return
    }

    try {
      await createNotification(recipientId, type, title, body, relatedId)
    } catch {
      setError('Notification setup is not available yet. Please run notification SQL setup.')
    }
  }

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

    const { data: createdContract, error: createError } = await supabase
      .from('contracts')
      .insert({
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
      .select('id')
      .maybeSingle()

    if (createError) {
      setError(createError.message)
      setWorking(false)
      return
    }

    await notifyIfOtherParty(
      selectedCounterparty.id,
      'contract_created',
      'New contract request',
      `${currentUsername} has created a contract for ${parsedQuantity}kg of ${selectedSymbol}`,
      createdContract?.id
    )

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

    const recipientId = isBuyer ? contract.seller_id : contract.buyer_id
    await notifyIfOtherParty(
      recipientId,
      'contract_signed',
      'Contract signed',
      `${currentUsername} has signed contract #${contract.id}`,
      contract.id
    )

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

    const targetContract = contracts.find((contract) => contract.id === contractId)
    const recipientId =
      targetContract?.buyer_id === user.id ? targetContract?.seller_id : targetContract?.buyer_id

    if (recipientId) {
      await notifyIfOtherParty(
        recipientId,
        'contract_amended',
        'Contract amended',
        `${currentUsername} has amended contract #${contractId}`,
        contractId
      )
    }

    setAmendingContractId(null)
    await loadContracts()
    setWorking(false)
  }

  const saveVerification = async (contract: ContractRow) => {
    if (!user) {
      return
    }

    const draft = verificationDrafts[contract.id]
    if (!draft) {
      return
    }

    setWorking(true)
    setError(null)

    const inspectedAt =
      draft.inspection_status === 'passed' || draft.inspection_status === 'failed'
        ? new Date().toISOString()
        : null

    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        inspection_company: draft.inspection_company || null,
        inspection_status: draft.inspection_status,
        inspection_note: draft.inspection_note || null,
        inspected_at: inspectedAt,
      })
      .eq('id', contract.id)

    if (updateError) {
      setError(updateError.message)
      setWorking(false)
      return
    }

    const note = `Inspection status set to ${draft.inspection_status} by ${currentUsername}${
      draft.inspection_note ? `: ${draft.inspection_note}` : ''
    }`

    await supabase.from('contract_events').insert({
      contract_id: contract.id,
      actor_id: user.id,
      event_type: 'inspection_update',
      note,
    })

    await notifyIfOtherParty(
      contract.buyer_id,
      'inspection_update',
      'Inspection update',
      `Inspection status updated to ${draft.inspection_status} on contract #${contract.id}`,
      contract.id
    )

    await notifyIfOtherParty(
      contract.seller_id,
      'inspection_update',
      'Inspection update',
      `Inspection status updated to ${draft.inspection_status} on contract #${contract.id}`,
      contract.id
    )

    await loadContracts()
    setWorking(false)
  }

  const uploadDocument = async (
    contract: ContractRow,
    file: File,
    documentType: ContractDocument['document_type']
  ) => {
    if (!user) {
      return
    }

    if (!storageReady) {
      setError('Storage bucket `contract-documents` is not configured yet')
      return
    }

    const validMimeTypes = ['application/pdf', 'image/png', 'image/jpeg']
    const validExtensions = ['.pdf', '.png', '.jpg', '.jpeg']
    const lowerName = file.name.toLowerCase()
    const hasValidExtension = validExtensions.some((ext) => lowerName.endsWith(ext))

    if (!validMimeTypes.includes(file.type) && !hasValidExtension) {
      setError('Only PDF and image documents are supported')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be 10MB or less')
      return
    }

    setWorking(true)
    setError(null)

    const path = `${contract.id}/${Date.now()}_${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('contract-documents')
      .upload(path, file)

    if (uploadError) {
      setError(uploadError.message)
      setWorking(false)
      return
    }

    const { error: insertError } = await supabase.from('contract_documents').insert({
      contract_id: contract.id,
      uploaded_by: user.id,
      document_type: documentType,
      file_name: file.name,
      storage_path: path,
    })

    if (insertError) {
      setError(insertError.message)
      setWorking(false)
      return
    }

    await supabase.from('contract_events').insert({
      contract_id: contract.id,
      actor_id: user.id,
      event_type: 'document_uploaded',
      note: `${formatDocumentType(documentType)} uploaded: ${file.name}`,
    })

    const recipientId = contract.buyer_id === user.id ? contract.seller_id : contract.buyer_id
    await notifyIfOtherParty(
      recipientId,
      'document_uploaded',
      'Document uploaded',
      `${currentUsername} uploaded ${formatDocumentType(documentType)} on contract #${contract.id}`,
      contract.id
    )

    await loadContracts()
    setWorking(false)
  }

  const downloadDocument = async (storagePath: string, fileName: string) => {
    const { data, error: downloadError } = await supabase.storage
      .from('contract-documents')
      .download(storagePath)

    if (downloadError || !data) {
      setError(downloadError?.message ?? 'Failed to download document')
      return
    }

    const url = URL.createObjectURL(data)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
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
            <div ref={counterpartySearchRef}>
              <input
                value={counterpartyQuery}
                onFocus={() => {
                  if (normalizeUsernameQuery(counterpartyQuery).length > 0) {
                    setShowCounterpartyDropdown(true)
                  }
                }}
                onChange={(event) => {
                  setCounterpartyQuery(event.target.value)
                  setCounterpartySearchError(null)
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

              {showCounterpartyDropdown ? (
                <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-md border border-slate-800 bg-slate-950/60 p-2">
                  {counterpartyLoading ? <p className="text-xs text-slate-400">Searching...</p> : null}
                  {!counterpartyLoading && normalizeUsernameQuery(counterpartyQuery).length < 2 ? (
                    <p className="text-xs text-slate-500">Type at least 2 characters</p>
                  ) : null}
                  {!counterpartyLoading && counterpartySearchError ? (
                    <p className="text-xs text-rose-300">{counterpartySearchError}</p>
                  ) : null}
                  {!counterpartyLoading &&
                  !counterpartySearchError &&
                  counterpartyResults.length === 0 &&
                  normalizeUsernameQuery(counterpartyQuery).length >= 2 ? (
                    <p className="text-xs text-slate-400">No users found</p>
                  ) : null}
                  {!counterpartyLoading && !counterpartySearchError
                    ? counterpartyResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            setSelectedCounterparty(result)
                            setCounterpartyQuery(result.username)
                            setCounterpartyResults([])
                            setShowCounterpartyDropdown(false)
                            setCounterpartySearchError(null)
                          }}
                          className="w-full rounded px-2 py-1 text-left text-sm text-slate-200 hover:bg-slate-800"
                        >
                          @{result.username}
                        </button>
                      ))
                    : null}
                </div>
              ) : null}
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
                const verificationDraft = verificationDrafts[contract.id] ?? {
                  inspection_company: contract.inspection_company ?? '',
                  inspection_status: contract.inspection_status,
                  inspection_note: contract.inspection_note ?? '',
                }
                const inspectionBadge = inspectionBadgeConfig(contract.inspection_status)
                const contractDocuments = documentsByContract[contract.id] ?? []
                const uploadType = uploadTypeByContract[contract.id] ?? 'other'

                return (
                  <div
                    key={contract.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-mono text-sm font-semibold text-cyan-300">
                        {contract.asset_symbol} · {Number(contract.quantity_kg).toLocaleString()} kg
                      </h3>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusBadgeClass(contract.status)}`}
                        >
                          {contract.status}
                        </span>
                        {contract.status === 'signed' ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs ${inspectionBadge.className}`}>
                            {inspectionBadge.label}
                          </span>
                        ) : null}
                      </div>
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

                    {contract.status === 'signed' ? (
                      <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/70 p-3">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Verification
                        </h4>
                        <div className="grid gap-2 md:grid-cols-4">
                          <input
                            value={verificationDraft.inspection_company}
                            onChange={(event) =>
                              setVerificationDrafts((current) => ({
                                ...current,
                                [contract.id]: {
                                  ...verificationDraft,
                                  inspection_company: event.target.value,
                                },
                              }))
                            }
                            placeholder="Inspection company"
                            className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
                          />
                          <select
                            value={verificationDraft.inspection_status}
                            onChange={(event) =>
                              setVerificationDrafts((current) => ({
                                ...current,
                                [contract.id]: {
                                  ...verificationDraft,
                                  inspection_status: event.target.value as VerificationDraft['inspection_status'],
                                },
                              }))
                            }
                            className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
                          >
                            <option value="not_started">Not started</option>
                            <option value="pending">Pending</option>
                            <option value="passed">Passed</option>
                            <option value="failed">Failed</option>
                          </select>
                          <input
                            value={verificationDraft.inspection_note}
                            onChange={(event) =>
                              setVerificationDrafts((current) => ({
                                ...current,
                                [contract.id]: {
                                  ...verificationDraft,
                                  inspection_note: event.target.value,
                                },
                              }))
                            }
                            placeholder="Inspector note"
                            className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => saveVerification(contract)}
                            className="rounded border border-indigo-500 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-900/20"
                          >
                            Save Verification
                          </button>
                        </div>
                        {contract.inspected_at ? (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Last inspection update: {formatLondonTime(contract.inspected_at)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/70 p-3">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Documents
                      </h4>
                      {!storageReady ? (
                        <p className="mb-2 text-xs text-amber-300">
                          Storage bucket `contract-documents` is missing. Run setup SQL first.
                        </p>
                      ) : null}
                      <div className="mb-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <select
                          value={uploadType}
                          onChange={(event) =>
                            setUploadTypeByContract((current) => ({
                              ...current,
                              [contract.id]: event.target.value as ContractDocument['document_type'],
                            }))
                          }
                          className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
                        >
                          {documentTypeOptions.map((option) => (
                            <option key={option} value={option}>
                              {formatDocumentType(option)}
                            </option>
                          ))}
                        </select>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) {
                              return
                            }

                            void uploadDocument(contract, file, uploadType)
                            event.currentTarget.value = ''
                          }}
                          className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
                        />
                        <span className="self-center text-[11px] text-slate-500">Max 10MB</span>
                      </div>

                      <div className="space-y-1">
                        {contractDocuments.length === 0 ? (
                          <p className="text-xs text-slate-500">No documents uploaded.</p>
                        ) : (
                          contractDocuments.map((document) => (
                            <div
                              key={document.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-2 text-xs"
                            >
                              <div>
                                <p className="text-slate-200">{formatDocumentType(document.document_type)}</p>
                                <p className="text-slate-400">{document.file_name}</p>
                                <p className="text-slate-500">
                                  {(normalizeJoin(document.uploader)?.username ?? 'Unknown')} ·{' '}
                                  {formatLondonTime(document.created_at)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => downloadDocument(document.storage_path, document.file_name)}
                                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                              >
                                Download
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
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
