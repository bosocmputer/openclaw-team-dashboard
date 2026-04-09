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
    // ── Central conference table (2×4) ──
    { uid: 'conf-table-1', type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: 5, row: 5 },
    { uid: 'conf-table-2', type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: 7, row: 5 },
    { uid: 'conf-table-3', type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: 5, row: 7 },
    { uid: 'conf-table-4', type: FurnitureType.TABLE_WOOD_SM_HORIZONTAL, col: 7, row: 7 },

    // ── Chairs — top row (facing down toward table) ──
    { uid: 'chair-t1', type: FurnitureType.BENCH, col: 4.5, row: 3.5 },
    { uid: 'chair-t2', type: FurnitureType.BENCH, col: 6.5, row: 3.5 },
    { uid: 'chair-t3', type: FurnitureType.BENCH, col: 8.5, row: 3.5 },

    // ── Chairs — bottom row (facing up toward table) ──
    { uid: 'chair-b1', type: FurnitureType.BENCH, col: 4.5, row: 9 },
    { uid: 'chair-b2', type: FurnitureType.BENCH, col: 6.5, row: 9 },
    { uid: 'chair-b3', type: FurnitureType.BENCH, col: 8.5, row: 9 },

    // ── Whiteboard on top wall ──
    { uid: 'whiteboard', type: FurnitureType.WHITEBOARD, col: 5, row: 1 },

    // ── Decor ──
    { uid: 'plant-l', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'plant-r', type: FurnitureType.PLANT, col: 13, row: 1 },
    { uid: 'cooler', type: FurnitureType.COOLER, col: 1, row: 6 },
    { uid: 'lamp-l', type: FurnitureType.LAMP, col: 1, row: 10 },
    { uid: 'lamp-r', type: FurnitureType.LAMP, col: 13, row: 10 },
  ]

  const tileColors = tiles.map(() => null)

  return {
    version: 1 as const,
    cols,
    rows,
    tiles,
    tileColors,
    furniture,
  }
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

type ResearchPhase = 'idle' | 'phase1' | 'phase2' | 'phase3' | 'done'

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
  const [messages, setMessages] = useState<ResearchMessage[]>([])
  const [finalAnswer, setFinalAnswer] = useState('')
  const [statusText, setStatusText] = useState('')
  const [tokenMap, setTokenMap] = useState<Record<string, AgentTokens>>({})
  const [error, setError] = useState('')

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

      // Fit the meeting room to viewport
      const cols = office.layout.cols
      const rows = office.layout.rows
      const fitZoom = Math.min(
        width / (cols * TILE_SIZE),
        height / (rows * TILE_SIZE),
      ) * 0.92
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
          undefined, undefined, undefined,
          true, office.dataFlows,
        )

        // Collect floating bubbles
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
            codeItems.push({
              key: `${ch.id}-code-${i}-${s.text}`,
              text: s.text,
              x: anchorX + s.x * zoom,
              y: anchorY - progress * totalDist,
              opacity: Math.max(0, alpha * 0.9),
            })
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
            commentItems.push({
              key: `${ch.id}-comment-${i}-${pc.text}`,
              text: pc.text,
              x: anchorX + pc.x * zoom,
              y: anchorYpc - progress * totalDistPc,
              opacity: Math.max(0, alpha * 0.95),
            })
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

  // Sync selected agents to office as seated characters
  const syncAgentsToOffice = useCallback((agentList: AgentPublic[]) => {
    const office = officeRef.current
    if (!office) return

    // Remove all existing agent characters
    for (const [, charId] of agentIdMapRef.current) {
      office.removeAgentImmediately(charId)
    }
    agentIdMapRef.current.clear()
    nextIdRef.current.current = 1

    // Add selected agents
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

  // Start research
  const startResearch = useCallback(async () => {
    if (!question.trim() || selectedAgentIds.length === 0 || phase !== 'idle') return
    setError('')
    setMessages([])
    setFinalAnswer('')
    setTokenMap({})
    setPhase('phase1')
    setStatusText('Phase 1: Independent Research...')

    const office = officeRef.current

    try {
      const res = await fetch('/api/team-research/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, agentIds: selectedAgentIds, dataSource: 'none' }),
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
            if (msg.includes('discussing')) setPhase('phase2')
            if (msg.includes('Synthesizing')) setPhase('phase3')
          }

          if (event === 'agent_start') {
            // Agent starts thinking — animate
            const charId = agentIdMapRef.current.get(data.agentId as string)
            if (charId !== undefined && office) {
              office.setAgentActive(charId, true)
            }
          }

          if (event === 'message') {
            const msg = data as unknown as ResearchMessage
            setMessages(prev => [...prev, msg])

            const charId = agentIdMapRef.current.get(msg.agentId)
            if (charId !== undefined && office) {
              if (msg.role === 'thinking') {
                office.pushCodeSnippet(charId, `💭 ${msg.content.slice(0, 30)}...`)
              } else if (msg.role === 'finding' || msg.role === 'analysis') {
                office.setAgentActive(charId, false)
                const snippet = msg.content.slice(0, 60).replace(/\n/g, ' ')
                office.pushSpeechBubble(charId, snippet)
              } else if (msg.role === 'chat') {
                const snippet = msg.content.slice(0, 50).replace(/\n/g, ' ')
                office.pushSpeechBubble(charId, snippet)
                // Draw data flow lines to others in debate
                for (const [otherId, otherCharId] of agentIdMapRef.current) {
                  if (otherId !== msg.agentId) {
                    office.addDataFlow(charId, otherCharId)
                  }
                }
              } else if (msg.role === 'synthesis') {
                office.setAgentActive(charId, true)
                office.pushSpeechBubble(charId, '✅ ' + msg.content.slice(0, 50).replace(/\n/g, ' '))
              }
            }
          }

          if (event === 'agent_tokens') {
            const { agentId, inputTokens, outputTokens, totalTokens } = data as {
              agentId: string; inputTokens: number; outputTokens: number; totalTokens: number
            }
            setTokenMap(prev => ({
              ...prev,
              [agentId]: { input: inputTokens, output: outputTokens, total: totalTokens },
            }))
          }

          if (event === 'final_answer') {
            setFinalAnswer(data.content as string)
          }

          if (event === 'done') {
            setPhase('done')
            setStatusText('Research complete!')
            // Reset all agents to idle
            if (office) {
              for (const [, charId] of agentIdMapRef.current) {
                office.setAgentActive(charId, false)
              }
            }
          }
        }
      }
    } catch (err) {
      setError(String(err))
      setPhase('idle')
    }
  }, [question, selectedAgentIds, phase])

  const toggleAgent = (id: string) => {
    setSelectedAgentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const phaseLabel: Record<ResearchPhase, string> = {
    idle: '',
    phase1: 'Phase 1 — Independent Research',
    phase2: 'Phase 2 — Debate',
    phase3: 'Phase 3 — Synthesis',
    done: 'Complete',
  }

  const phaseColor: Record<ResearchPhase, string> = {
    idle: '',
    phase1: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    phase2: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    phase3: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    done: 'bg-green-500/20 text-green-300 border-green-500/40',
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── Top bar: question input ── */}
      <div className="flex-none bg-gray-900 border-b border-white/10 p-3">
        <div className="flex items-center gap-2 max-w-5xl mx-auto">
          <span className="text-lg">🏢</span>
          <span className="font-semibold text-sm text-white/70">Meeting Room Research</span>
          <div className="flex-1 flex items-center gap-2 ml-2">
            <input
              className="flex-1 bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              placeholder="Ask your question..."
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startResearch()}
              disabled={phase !== 'idle' && phase !== 'done'}
            />
            <button
              onClick={phase === 'done' ? () => { setPhase('idle'); setFinalAnswer(''); setMessages([]) } : startResearch}
              disabled={(phase !== 'idle' && phase !== 'done') || (!question.trim() && phase === 'idle') || selectedAgentIds.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
            >
              {phase === 'done' ? 'New Research' : phase !== 'idle' ? 'Running...' : 'Research'}
            </button>
          </div>
        </div>

        {/* Agent selector */}
        <div className="flex gap-2 flex-wrap mt-2 max-w-5xl mx-auto">
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-all ${
                selectedAgentIds.includes(agent.id)
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-transparent border-white/10 text-white/40'
              }`}
            >
              <span>{agent.emoji}</span>
              <span>{agent.name}</span>
              {tokenMap[agent.id] && (
                <span className="text-white/50 ml-1">{(tokenMap[agent.id].total / 1000).toFixed(1)}k</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Canvas — fixed width, left side */}
        <div ref={containerRef} className="flex-none w-72 relative overflow-hidden bg-gray-950 border-r border-white/10">
          {!officeReady && (
            <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
              Loading...
            </div>
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
            <div className="absolute bottom-2 left-0 right-0 flex flex-col items-center gap-1" style={{ zIndex: 20 }}>
              <div className={`px-3 py-1 rounded-full text-[10px] font-medium border ${phaseColor[phase]}`}>
                {phaseLabel[phase]}
              </div>
            </div>
          )}
        </div>

        {/* Right panel: messages + final answer — takes remaining space */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
          {messages.length === 0 && !finalAnswer ? (
            <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
              {phase === 'idle' ? 'Ask a question to start the research...' : 'Starting...'}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map(msg => (
                  <div key={msg.id} className={`text-sm ${msg.role === 'thinking' ? 'opacity-50' : ''}`}>
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
              </div>

              {/* Final answer */}
              {finalAnswer && (
                <div className="flex-none border-t border-white/10 p-4 bg-gray-950/60">
                  <div className="text-xs font-semibold text-purple-300 mb-2">✅ Final Answer</div>
                  <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">{finalAnswer}</div>
                </div>
              )}
            </>
          )}
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
