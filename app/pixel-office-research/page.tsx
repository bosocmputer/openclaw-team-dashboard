'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { OfficeState } from '@/lib/pixel-office/engine/officeState'
import { renderFrame } from '@/lib/pixel-office/engine/renderer'
import { TILE_SIZE } from '@/lib/pixel-office/constants'
import { TileType, FurnitureType } from '@/lib/pixel-office/types'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture } from '@/lib/pixel-office/types'
import { loadCharacterPNGs, loadWallPNG } from '@/lib/pixel-office/sprites/pngLoader'

// ─── Meeting Room Layout ──────────────────────────────────────────────────────

function createMeetingRoomLayout(): OfficeLayout {
  const W = TileType.WALL
  const F1 = TileType.FLOOR_1
  const F3 = TileType.FLOOR_3
  const F4 = TileType.FLOOR_4

  const cols = 15
  const rows = 13
  const tiles: TileTypeVal[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        tiles.push(W)
      } else if (r === rows - 2 && c >= 6 && c <= 8) {
        tiles.push(F4) // doorway
      } else if (r >= 3 && r <= 9 && c >= 3 && c <= 11) {
        tiles.push(F3) // carpet meeting area
      } else {
        tiles.push(F1)
      }
    }
  }

  const furniture: PlacedFurniture[] = [
    { uid: 'conf-table-1', type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: 5, row: 5 },
    { uid: 'conf-table-2', type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: 7, row: 5 },
    { uid: 'conf-table-3', type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: 5, row: 7 },
    { uid: 'conf-table-4', type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: 7, row: 7 },
    { uid: 'chair-t1', type: FurnitureType.BENCH, col: 4.5, row: 3.5 },
    { uid: 'chair-t2', type: FurnitureType.BENCH, col: 6.5, row: 3.5 },
    { uid: 'chair-t3', type: FurnitureType.BENCH, col: 8.5, row: 3.5 },
    { uid: 'chair-b1', type: FurnitureType.BENCH, col: 4.5, row: 9 },
    { uid: 'chair-b2', type: FurnitureType.BENCH, col: 6.5, row: 9 },
    { uid: 'chair-b3', type: FurnitureType.BENCH, col: 8.5, row: 9 },
    { uid: 'whiteboard', type: FurnitureType.WHITEBOARD, col: 5, row: 1 },
    { uid: 'plant-l', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'plant-r', type: FurnitureType.PLANT, col: 13, row: 1 },
    { uid: 'cooler', type: FurnitureType.COOLER, col: 1, row: 6 },
    { uid: 'lamp-l', type: FurnitureType.LAMP, col: 1, row: 10 },
    { uid: 'lamp-r', type: FurnitureType.LAMP, col: 13, row: 10 },
  ]

  const tileColors = tiles.map(() => null)

  return { version: 1 as const, cols, rows, tiles, tileColors, furniture }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentPublic {
  id: string
  name: string
  emoji: string
  provider: string
  model: string
  soul: string
  role: string
  active: boolean
  hasApiKey: boolean
  useWebSearch?: boolean
  seniority?: number
}

interface ResearchMessage {
  id: string
  agentId: string
  agentName: string
  agentEmoji: string
  role: 'thinking' | 'finding' | 'analysis' | 'synthesis' | 'chat'
  content: string
  tokensUsed: number
  timestamp: string
}

interface AgentTokens {
  input: number
  output: number
  total: number
}

interface ConversationRound {
  question: string
  messages: ResearchMessage[]
  finalAnswer: string
  suggestions: string[]
  chairmanId?: string
}

type HistoryMode = 'full' | 'last3' | 'summary' | 'none'

interface ConversationTurn {
  question: string
  answer: string
}

interface ServerSession {
  id: string
  question: string
  status: string
  startedAt: string
  totalTokens: number
  messages: ResearchMessage[]
  finalAnswer?: string
}

type ResearchPhase = 'idle' | 'phase1' | 'phase2' | 'phase3' | 'done'

const STORAGE_KEY = 'pixel_research_conversation_v1'

// ─── Sprite assets promise (shared) ──────────────────────────────────────────
let spritePromise: Promise<void> | null = null
const CODE_SNIPPET_LIFETIME_SEC = 5.5

// ─── Component ────────────────────────────────────────────────────────────────

export default function PixelOfficeResearchPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const officeRef = useRef<OfficeState | null>(null)
  const agentIdMapRef = useRef<Map<string, number>>(new Map())
  const nextIdRef = useRef({ current: 1 })
  const animFrameRef = useRef<number | null>(null)
  const floatingCodeRef = useRef<Array<{ key: string; text: string; x: number; y: number; opacity: number }>>([])
  const floatingCommentsRef = useRef<Array<{ key: string; text: string; x: number; y: number; opacity: number }>>([])
  const [floatingTick, setFloatingTick] = useState(0)

  const [officeReady, setOfficeReady] = useState(false)
  const [agents, setAgents] = useState<AgentPublic[]>([])
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [phase, setPhase] = useState<ResearchPhase>('idle')
  const [tokenMap, setTokenMap] = useState<Record<string, AgentTokens>>({})
  const [error, setError] = useState('')
  const [historyMode, setHistoryMode] = useState<HistoryMode>('last3')
  const [chairmanId, setChairmanId] = useState<string | null>(null)
  const [searchingAgents, setSearchingAgents] = useState<Set<string>>(new Set())

  // Conversation state
  const [rounds, setRounds] = useState<ConversationRound[]>([])
  const [currentMessages, setCurrentMessages] = useState<ResearchMessage[]>([])
  const [currentFinalAnswer, setCurrentFinalAnswer] = useState('')
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([])
  const [statusText, setStatusText] = useState('')

  // Server history
  const [serverSessions, setServerSessions] = useState<ServerSession[]>([])
  const [viewingSession, setViewingSession] = useState<ServerSession | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const messagesBottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Refs to capture latest state when committing round
  const currentFinalAnswerRef = useRef('')
  const currentMessagesRef = useRef<ResearchMessage[]>([])
  const currentSuggestionsRef = useRef<string[]>([])
  const chairmanIdRef = useRef<string | null>(null)

  useEffect(() => { currentFinalAnswerRef.current = currentFinalAnswer }, [currentFinalAnswer])
  useEffect(() => { currentMessagesRef.current = currentMessages }, [currentMessages])
  useEffect(() => { currentSuggestionsRef.current = currentSuggestions }, [currentSuggestions])
  useEffect(() => { chairmanIdRef.current = chairmanId }, [chairmanId])

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.rounds) setRounds(parsed.rounds)
      }
    } catch { /* ignore */ }
  }, [])

  // Save to localStorage when rounds change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rounds }))
    } catch { /* ignore */ }
  }, [rounds])

  // Load agents
  useEffect(() => {
    fetch('/api/team-agents')
      .then(r => r.json())
      .then(d => {
        const active = (d.agents ?? []).filter((a: AgentPublic) => a.active)
        setAgents(active)
        setSelectedAgentIds(active.map((a: AgentPublic) => a.id))
      })
      .catch(() => {})
  }, [])

  // Fetch server history
  const fetchServerHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/team-research')
      const data = await res.json()
      setServerSessions((data.sessions ?? []).slice(0, 20))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchServerHistory() }, [fetchServerHistory])

  // Init office engine
  useEffect(() => {
    const layout = createMeetingRoomLayout()
    officeRef.current = new OfficeState(layout, 'en')
    if (!spritePromise) {
      spritePromise = Promise.all([loadCharacterPNGs(), loadWallPNG()]).then(() => undefined)
    }
    spritePromise.then(() => setOfficeReady(true))
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // Game loop
  useEffect(() => {
    if (!officeReady || !canvasRef.current || !containerRef.current || !officeRef.current) return
    const canvas = canvasRef.current
    const container = containerRef.current
    const office = officeRef.current
    let lastTime = 0

    const render = (time: number) => {
      const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time
      const width = container.clientWidth
      const height = container.clientHeight
      const cols = office.layout.cols
      const rows = office.layout.rows
      const fitZoom = Math.min(width / (cols * TILE_SIZE), height / (rows * TILE_SIZE)) * 0.92
      const zoom = Math.max(1, Math.min(6, fitZoom))
      const pan = { x: 0, y: 0 }
      const dpr = window.devicePixelRatio || 1
      office.update(dt)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.imageSmoothingEnabled = false
        ctx.scale(dpr, dpr)
        renderFrame(
          ctx, width, height, office.tileMap, office.furniture, office.getCharacters(),
          zoom, pan.x, pan.y,
          { selectedAgentId: null, hoveredAgentId: null, hoveredTile: null, seats: office.seats, characters: office.characters },
          undefined, office.layout.tileColors, office.layout.cols, office.layout.rows,
          undefined, undefined, undefined, true, office.dataFlows,
        )
        const mapW = cols * TILE_SIZE * zoom
        const mapH = rows * TILE_SIZE * zoom
        const ox = (width - mapW) / 2 + pan.x
        const oy = (height - mapH) / 2 + pan.y
        const containerTop = container.offsetTop
        const codeItems: typeof floatingCodeRef.current = []
        const commentItems: typeof floatingCommentsRef.current = []
        for (const ch of office.getCharacters()) {
          const anchorX = ox + ch.x * zoom
          const anchorY = containerTop + oy + (ch.y - 10) * zoom
          const totalDist = anchorY + 24
          for (let i = 0; i < ch.codeSnippets.length; i++) {
            const s = ch.codeSnippets[i]
            const progress = s.age / CODE_SNIPPET_LIFETIME_SEC
            if (progress <= 0 || progress >= 1) continue
            const alpha = progress < 0.15 ? progress / 0.15 : progress > 0.88 ? (1 - progress) / 0.12 : 1
            codeItems.push({ key: `${ch.id}-code-${i}-${s.text}`, text: s.text, x: anchorX + s.x * zoom, y: anchorY - progress * totalDist, opacity: Math.max(0, alpha * 0.9) })
          }
          const lifetime = 4.0
          const anchorYpc = containerTop + oy + (ch.y - 24) * zoom
          const totalDistPc = anchorYpc + 20
          for (let i = 0; i < ch.photoComments.length; i++) {
            const pc = ch.photoComments[i]
            const progress = pc.age / lifetime
            let alpha = 1.0
            if (pc.age < 0.3) alpha = pc.age / 0.3
            if (progress > 0.6) alpha = (1 - progress) / 0.4
            commentItems.push({ key: `${ch.id}-comment-${i}-${pc.text}`, text: pc.text, x: anchorX + pc.x * zoom, y: anchorYpc - progress * totalDistPc, opacity: Math.max(0, alpha * 0.95) })
          }
        }
        floatingCodeRef.current = codeItems
        floatingCommentsRef.current = commentItems
      }
      setFloatingTick(t => t + 1)
      animFrameRef.current = requestAnimationFrame(render)
    }
    animFrameRef.current = requestAnimationFrame(render)
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
    }
  }, [officeReady])

  // Sync selected agents to office
  const syncAgentsToOffice = useCallback((agentList: AgentPublic[]) => {
    const office = officeRef.current
    if (!office) return
    for (const [, charId] of agentIdMapRef.current) office.removeAgentImmediately(charId)
    agentIdMapRef.current.clear()
    nextIdRef.current.current = 1
    for (const agent of agentList) {
      const charId = nextIdRef.current.current++
      agentIdMapRef.current.set(agent.id, charId)
      office.addAgent(charId, undefined, undefined, undefined, true, false)
      const ch = office.characters.get(charId)
      if (ch) ch.label = `${agent.emoji} ${agent.name}`
    }
  }, [])

  useEffect(() => {
    if (!officeReady) return
    const selected = agents.filter(a => selectedAgentIds.includes(a.id))
    syncAgentsToOffice(selected)
  }, [officeReady, selectedAgentIds, agents, syncAgentsToOffice])

  // Scroll messages to bottom
  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentMessages, rounds])

  const buildHistory = (): ConversationTurn[] =>
    rounds.map(r => ({ question: r.question, answer: r.finalAnswer }))

  const toggleAgent = (id: string) => {
    setSelectedAgentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Start research
  const startResearch = useCallback(async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim()
    if (!q || selectedAgentIds.length === 0 || phase !== 'idle') return

    setError('')
    setCurrentMessages([])
    setCurrentFinalAnswer('')
    setCurrentSuggestions([])
    setChairmanId(null)
    setSearchingAgents(new Set())
    setPhase('phase1')
    setStatusText('🏛️ เปิดการประชุม...')
    if (!overrideQuestion) setQuestion('')

    const office = officeRef.current

    try {
      const res = await fetch('/api/team-research/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: q,
          agentIds: selectedAgentIds,
          dataSource: 'none',
          conversationHistory: buildHistory(),
          historyMode,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const eventLine = part.match(/^event: (.+)$/m)
          const dataLine = part.match(/^data: (.+)$/m)
          if (!eventLine || !dataLine) continue
          const event = eventLine[1]
          let data: Record<string, unknown>
          try { data = JSON.parse(dataLine[1]) } catch { continue }

          if (event === 'status') {
            const msg = data.message as string
            setStatusText(msg)
            if (msg.includes('Phase 2') || msg.includes('อภิปราย')) setPhase('phase2')
            if (msg.includes('Phase 3') || msg.includes('ประธานสรุป')) setPhase('phase3')
          }

          if (event === 'chairman') {
            setChairmanId(data.agentId as string)
            chairmanIdRef.current = data.agentId as string
          }

          if (event === 'agent_searching') {
            setSearchingAgents(prev => new Set([...prev, data.agentId as string]))
          }

          if (event === 'agent_start') {
            const charId = agentIdMapRef.current.get(data.agentId as string)
            if (charId !== undefined && office) office.setAgentActive(charId, true)
            setSearchingAgents(prev => { const n = new Set(prev); n.delete(data.agentId as string); return n })
          }

          if (event === 'message') {
            const msg = data as unknown as ResearchMessage
            setSearchingAgents(prev => { const n = new Set(prev); n.delete(msg.agentId); return n })
            setCurrentMessages(prev => [...prev, msg])
            const charId = agentIdMapRef.current.get(msg.agentId)
            if (charId !== undefined && office) {
              if (msg.role === 'thinking') {
                office.pushCodeSnippet(charId, `💭 ${msg.content.slice(0, 30)}...`)
              } else if (msg.role === 'finding') {
                office.setAgentActive(charId, false)
                office.pushSpeechBubble(charId, msg.content.slice(0, 60).replace(/\n/g, ' '))
              } else if (msg.role === 'chat') {
                office.pushSpeechBubble(charId, msg.content.slice(0, 50).replace(/\n/g, ' '))
                for (const [otherId, otherCharId] of agentIdMapRef.current) {
                  if (otherId !== msg.agentId) office.addDataFlow(charId, otherCharId)
                }
              } else if (msg.role === 'synthesis') {
                office.setAgentActive(charId, true)
                office.pushSpeechBubble(charId, '🏛️ ' + msg.content.slice(0, 50).replace(/\n/g, ' '))
              }
            }
          }

          if (event === 'agent_tokens') {
            const { agentId, inputTokens, outputTokens, totalTokens } = data as { agentId: string; inputTokens: number; outputTokens: number; totalTokens: number }
            setTokenMap(prev => ({ ...prev, [agentId]: { input: inputTokens, output: outputTokens, total: totalTokens } }))
          }

          if (event === 'final_answer') {
            setCurrentFinalAnswer(data.content as string)
          }

          if (event === 'follow_up_suggestions') {
            setCurrentSuggestions((data.suggestions as string[]) ?? [])
          }

          if (event === 'done') {
            setPhase('done')
            setStatusText('✅ ประชุมเสร็จสิ้น')
            setSearchingAgents(new Set())
            if (office) {
              for (const [, charId] of agentIdMapRef.current) office.setAgentActive(charId, false)
            }
          }
        }
      }
    } catch (err) {
      setError(String(err))
      setPhase('idle')
      return
    }

    setSearchingAgents(new Set())
    // Commit round
    setRounds(prev => [
      ...prev,
      {
        question: q,
        messages: currentMessagesRef.current,
        finalAnswer: currentFinalAnswerRef.current,
        suggestions: currentSuggestionsRef.current,
        chairmanId: chairmanIdRef.current ?? undefined,
      },
    ])
    setCurrentMessages([])
    setCurrentFinalAnswer('')
    setCurrentSuggestions([])
    setPhase('idle')
    fetchServerHistory()
    setTimeout(() => textareaRef.current?.focus(), 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, selectedAgentIds, phase, rounds, fetchServerHistory])

  const exportMarkdown = () => {
    const lines: string[] = ['# Meeting Room Research', `> Export: ${new Date().toLocaleString('th')}`, '']
    rounds.forEach((r, i) => {
      lines.push(`## รอบที่ ${i + 1}: ${r.question}`, '')
      r.messages.forEach(m => {
        if (m.role === 'thinking') return
        lines.push(`### ${m.agentEmoji} ${m.agentName} (${m.role})`, m.content, '')
      })
      if (r.finalAnswer) lines.push('### ✅ สรุปคำตอบ', r.finalAnswer, '')
      lines.push('---', '')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meeting-research-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const phaseLabel: Record<ResearchPhase, string> = {
    idle: '', phase1: '📋 Phase 1 — นำเสนอมุมมอง',
    phase2: '💬 Phase 2 — อภิปราย', phase3: '🏛️ Phase 3 — ประธานสรุปมติ', done: '✅ ประชุมเสร็จสิ้น',
  }
  const phaseColor: Record<ResearchPhase, string> = {
    idle: '', phase1: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    phase2: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    phase3: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    done: 'bg-green-500/20 text-green-300 border-green-500/40',
  }

  const isRunning = phase !== 'idle' && phase !== 'done'

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-none bg-gray-900 border-b border-white/10 p-3">
        <div className="flex items-center gap-2 max-w-5xl mx-auto">
          <span className="text-lg">🏛️</span>
          <span className="font-semibold text-sm text-white/70">Meeting Room</span>
          {rounds.length > 0 && (
            <span className="text-xs text-white/40 font-mono">{rounds.length} วาระ</span>
          )}
          {/* historyMode */}
          <select
            value={historyMode}
            onChange={e => setHistoryMode(e.target.value as HistoryMode)}
            aria-label="Context Memory Mode"
            title="Context Memory Mode"
            className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs text-white/60 focus:outline-none"
          >
            <option value="full">Full memory</option>
            <option value="last3">Last 3 วาระ</option>
            <option value="summary">Summary</option>
            <option value="none">No memory</option>
          </select>
          <div className="flex-1 flex items-center gap-2 ml-1">
            <textarea
              ref={textareaRef}
              className="flex-1 bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
              placeholder={rounds.length > 0 ? 'พิมพ์วาระต่อไป... (Enter)' : 'พิมพ์วาระแรก... (Enter เพื่อเปิดประชุม)'}
              value={question}
              rows={1}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  startResearch()
                }
              }}
              disabled={isRunning}
            />
            <button
              onClick={() => startResearch()}
              disabled={isRunning || !question.trim() || selectedAgentIds.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white whitespace-nowrap"
            >
              {isRunning ? 'กำลังประชุม...' : '🏛️ เปิดวาระ'}
            </button>
            {rounds.length > 0 && (
              <button
                onClick={exportMarkdown}
                className="px-3 py-2 rounded-lg text-xs text-white/50 border border-white/10 hover:border-white/30 transition-colors whitespace-nowrap"
              >
                📄 Minutes
              </button>
            )}
            {rounds.length > 0 && (
              <button
                onClick={() => { setRounds([]); setCurrentMessages([]); setCurrentFinalAnswer(''); setCurrentSuggestions([]); setPhase('idle'); localStorage.removeItem(STORAGE_KEY) }}
                className="px-3 py-2 rounded-lg text-xs text-white/50 border border-white/10 hover:border-red-500/30 transition-colors whitespace-nowrap"
              >
                🗑 ใหม่
              </button>
            )}
            <button
              onClick={() => setShowHistory(h => !h)}
              className={`px-3 py-2 rounded-lg text-xs border transition-colors whitespace-nowrap ${showHistory ? 'border-blue-500/40 text-blue-300 bg-blue-500/10' : 'border-white/10 text-white/50 hover:border-white/30'}`}
            >
              📋 History ({serverSessions.length})
            </button>
          </div>
        </div>

        {/* Agent selector */}
        <div className="flex gap-2 flex-wrap mt-2 max-w-5xl mx-auto">
          {agents.map(agent => {
            const isChair = agent.id === chairmanId
            const isSearching = searchingAgents.has(agent.id)
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => toggleAgent(agent.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-all ${
                  selectedAgentIds.includes(agent.id)
                    ? 'bg-white/10 border-white/30 text-white'
                    : 'bg-transparent border-white/10 text-white/40'
                }`}
              >
                <span>{agent.emoji}</span>
                <span>{agent.name}</span>
                {isChair && <span className="text-[9px] px-1 rounded bg-blue-500 text-white">ประธาน</span>}
                {agent.useWebSearch && <span title="Web Search" className="text-[9px]">🔍</span>}
                {isSearching && <span className="text-[9px] text-blue-300 animate-pulse">ค้นหา...</span>}
                {tokenMap[agent.id] && (
                  <span className="text-white/50 ml-1">{(tokenMap[agent.id].total / 1000).toFixed(1)}k</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main area: top canvas / bottom messages ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Canvas */}
        <div ref={containerRef} className="flex-none h-[38%] relative overflow-hidden bg-gray-950 border-b border-white/10">
          {!officeReady && (
            <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">Loading...</div>
          )}
          <canvas ref={canvasRef} className="absolute inset-0" />

          {/* Floating code snippets */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }} key={floatingTick}>
            {floatingCodeRef.current.map(item => (
              <div
                key={item.key}
                className="absolute text-[10px] font-mono text-emerald-400 whitespace-nowrap select-none"
                style={{ left: item.x, top: item.y, opacity: item.opacity, transform: 'translateX(-50%)' }}
              >
                {item.text}
              </div>
            ))}
            {floatingCommentsRef.current.map(item => (
              <div
                key={item.key}
                className="absolute text-[11px] font-medium text-white whitespace-nowrap select-none bg-gray-900/80 px-2 py-0.5 rounded-full border border-white/10"
                style={{ left: item.x, top: item.y, opacity: item.opacity, transform: 'translateX(-50%)' }}
              >
                {item.text}
              </div>
            ))}
          </div>

          {/* Phase indicator */}
          {phase !== 'idle' && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center" style={{ zIndex: 20 }}>
              <div className={`px-3 py-1 rounded-full text-[10px] font-medium border ${phaseColor[phase]}`}>
                {phaseLabel[phase]}
              </div>
            </div>
          )}
        </div>

        {/* Messages — scrollable conversation */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
          {/* History panel overlay */}
          {showHistory && (
            <div className="absolute inset-0 z-10 bg-gray-900/98 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="text-sm font-semibold text-white/80">📋 Research History ({serverSessions.length})</div>
                <button onClick={() => setShowHistory(false)} className="text-white/40 hover:text-white text-lg">✕</button>
              </div>
              {serverSessions.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-white/30 text-sm">ไม่มีประวัติ</div>
              ) : (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {serverSessions.map(s => (
                    <button
                      key={s.id}
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/team-research/${s.id}`)
                          const data = await res.json()
                          if (data.session) { setViewingSession(data.session); setShowHistory(false) }
                        } catch { /* ignore */ }
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${viewingSession?.id === s.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/10 hover:border-white/20 bg-gray-800/50'}`}
                    >
                      <div className="text-xs text-white/80 line-clamp-2">{s.question}</div>
                      <div className="text-[10px] text-white/40 mt-1">
                        {s.status === 'completed' ? '✅' : s.status === 'error' ? '❌' : '⏳'}{' '}
                        {new Date(s.startedAt).toLocaleString('th')}
                        {s.totalTokens > 0 && ` · ${s.totalTokens.toLocaleString()} tokens`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-6">

            {/* Viewing server session */}
            {viewingSession && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                  <span>📋 ดูประวัติ: {viewingSession.question}</span>
                  <button onClick={() => setViewingSession(null)} className="ml-auto text-white/40 hover:text-white">✕</button>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-xl px-4 py-2 rounded-2xl rounded-tr-sm bg-blue-600 text-white text-sm">{viewingSession.question}</div>
                </div>
                {viewingSession.messages.map(msg => (
                  <div key={msg.id} className={`text-sm ${msg.role === 'thinking' ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{msg.agentEmoji}</span>
                      <span className="font-semibold text-white/90">{msg.agentName}</span>
                      <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 text-white/50">{msg.role}</span>
                    </div>
                    <div className="text-white/75 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))}
                {viewingSession.finalAnswer && (
                  <div className="border-t border-white/10 pt-3 bg-gray-950/40 rounded-xl p-4">
                    <div className="text-xs font-semibold text-purple-300 mb-2">✅ Final Answer</div>
                    <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{viewingSession.finalAnswer}</div>
                    <button onClick={() => { setViewingSession(null); setQuestion(viewingSession.question) }} className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-blue-500/40 text-blue-300">
                      🔄 ถามคำถามนี้อีกครั้ง
                    </button>
                  </div>
                )}
              </div>
            )}

            {!viewingSession && rounds.length === 0 && currentMessages.length === 0 && phase === 'idle' && (
              <div className="flex items-center justify-center h-full text-white/20 text-sm text-center">
                Ask a question to start the research...<br />
                <span className="text-xs mt-1 block opacity-60">ถามต่อเรื่อย ๆ ได้ agents จำ context ทุกรอบ · refresh ก็ไม่หาย</span>
              </div>
            )}

            {/* Past rounds */}
            {rounds.map((round, roundIndex) => (
              <div key={roundIndex} className="space-y-3">
                {/* Round separator */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-white/10" />
                  <div className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-300">
                    รอบที่ {roundIndex + 1}
                  </div>
                  <div className="flex-1 border-t border-white/10" />
                </div>

                {/* Question bubble */}
                <div className="flex justify-end">
                  <div className="max-w-xl px-4 py-2 rounded-2xl rounded-tr-sm bg-blue-600 text-white text-sm">
                    {round.question}
                  </div>
                </div>

                {/* Messages */}
                {round.messages.map(msg => (
                  <div key={msg.id} className={`text-sm ${msg.role === 'thinking' ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{msg.agentEmoji}</span>
                      <span className="font-semibold text-white/90">{msg.agentName}</span>
                      <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium ${
                        msg.role === 'thinking' ? 'bg-blue-500/20 text-blue-300' :
                        msg.role === 'finding' ? 'bg-emerald-500/20 text-emerald-300' :
                        msg.role === 'chat' ? 'bg-orange-500/20 text-orange-300' :
                        msg.role === 'synthesis' ? 'bg-purple-500/20 text-purple-300' :
                        'bg-white/10 text-white/50'
                      }`}>{msg.role}</span>
                    </div>
                    <div className="text-white/75 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))}

                {/* Final answer */}
                {round.finalAnswer && (
                  <div className="border-t border-white/10 pt-3 bg-gray-950/40 rounded-xl p-4">
                    <div className="text-xs font-semibold text-purple-300 mb-2">✅ Final Answer</div>
                    <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{round.finalAnswer}</div>
                  </div>
                )}

                {/* Follow-up suggestions (only last completed round, when idle) */}
                {roundIndex === rounds.length - 1 && round.suggestions.length > 0 && phase === 'idle' && currentMessages.length === 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-white/40">💡 คำถามต่อเนื่อง:</div>
                    <div className="flex flex-col gap-1.5">
                      {round.suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => startResearch(s)}
                          className="text-left px-3 py-2 rounded-lg border border-white/10 text-xs text-white/60 hover:border-white/30 hover:text-white/80 transition-all bg-gray-800/50"
                        >
                          → {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Current round in progress */}
            {(currentMessages.length > 0 || isRunning) && (
              <div className="space-y-3">
                {rounds.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-white/10" />
                    <div className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-300">
                      รอบที่ {rounds.length + 1}
                    </div>
                    <div className="flex-1 border-t border-white/10" />
                  </div>
                )}
                {statusText && (
                  <div className="text-xs text-white/40 font-mono flex items-center gap-2">
                    {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />}
                    {statusText}
                  </div>
                )}
                {currentMessages.map(msg => (
                  <div key={msg.id} className={`text-sm ${msg.role === 'thinking' ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{msg.agentEmoji}</span>
                      <span className="font-semibold text-white/90">{msg.agentName}</span>
                      <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium ${
                        msg.role === 'thinking' ? 'bg-blue-500/20 text-blue-300' :
                        msg.role === 'finding' ? 'bg-emerald-500/20 text-emerald-300' :
                        msg.role === 'chat' ? 'bg-orange-500/20 text-orange-300' :
                        msg.role === 'synthesis' ? 'bg-purple-500/20 text-purple-300' :
                        'bg-white/10 text-white/50'
                      }`}>{msg.role}</span>
                    </div>
                    <div className="text-white/75 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))}
                {currentFinalAnswer && (
                  <div className="border-t border-white/10 pt-3 bg-gray-950/40 rounded-xl p-4">
                    <div className="text-xs font-semibold text-purple-300 mb-2">✅ Final Answer</div>
                    <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{currentFinalAnswer}</div>
                  </div>
                )}
              </div>
            )}

            <div ref={messagesBottomRef} />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex-none bg-red-900/30 border-t border-red-500/30 px-4 py-2 text-xs text-red-300">
          ⚠️ {error}
        </div>
      )}
    </div>
  )
}
