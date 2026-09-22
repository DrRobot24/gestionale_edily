import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from './cn'

/* ══════════════════════════════════════════════════════════════════
   IL VISORE — una foto guardata sul serio, non aperta e basta.

   Prima le foto si aprivano con target="_blank", cioe' si consegnavano
   al visualizzatore del browser. Su una foto di cantiere da dodici
   megapixel quello la rimpicciolisce per farla stare nella finestra e
   poi non lascia quasi scorrere: si vede tutta e non si vede niente.
   Segnalato dall'utente il 2026-09-22: «quando ci clicco e la voglio
   vedere bene non mi fa scrollare».

   Ma il punto non e' lo scroll: e' COSA CI SI DEVE FARE. Una foto di
   cantiere si guarda per cercare una cosa piccola dentro una cosa
   grande — una crepa, un ferro fuori posto, la data su un documento
   appoggiato al muro. Serve avvicinarsi a un pezzo e poi spostarsi
   dentro l'immagine, che e' un gesto solo in due tempi.

   Quindi:
     ruota / pizzico   avvicina e allontana, dove sta il puntatore
     trascina          sposta l'inquadratura, come una mappa
     doppio clic       avvicina a 2x, e da vicino torna indietro
     ← →               lo scatto prima e quello dopo, senza uscire
     Esc               si chiude

   Chi non lo sa lo scopre dalla riga di aiuto in basso, che e' l'unica
   decorazione che questo pannello si concede.

   Il pannello e' nero perche' qui l'immagine e' l'unica cosa che conta:
   un fondo bianco con i bordi neri del resto del gestionale
   competerebbe con lo scatto proprio mentre lo si sta esaminando. E'
   l'eccezione che conferma la regola del neo-brutalismo, e vale solo
   per questa finestra.
   ══════════════════════════════════════════════════════════════════ */

export type Scatto = {
  /** L'indirizzo firmato dell'immagine. */
  url: string
  /** Cosa si sta guardando, per chi usa uno screen reader e per la
   *  riga in alto: la didascalia se c'e', altrimenti la data. */
  titolo?: string | null
  sottotitolo?: string | null
}

type Props = {
  scatti: Scatto[]
  /** Quale si sta guardando. `null` tiene il visore chiuso. */
  indice: number | null
  onChiudi: () => void
  onVai: (indice: number) => void
}

/** Quanto ci si puo' avvicinare e allontanare. Sotto 1 l'immagine
 *  rimpicciolirebbe dentro una finestra che e' gia' tutto lo schermo;
 *  sopra 8 si guardano i pixel, non piu' la foto. */
const MIN = 1
const MAX = 8

export function Visore({ scatti, indice, onChiudi, onVai }: Props) {
  const aperto = indice !== null && scatti.length > 0
  const scatto = aperto ? scatti[indice] : undefined

  /** `zoom` quanto si e' vicini, `off` di quanto e' spostata
   *  l'inquadratura rispetto al centro, in pixel di schermo. */
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })

  /* Il trascinamento sta in un ref e non nello stato: cambia a ogni
     pixel di movimento del mouse, e passarlo da useState farebbe un
     render per pixel. Nello stato ci finisce solo il risultato. */
  const trascina = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [inMano, setInMano] = useState(false)

  const cornice = useRef<HTMLDivElement>(null)
  const chiudiBtn = useRef<HTMLButtonElement>(null)

  /** Si riparte sempre dall'immagine intera: cambiando scatto, il
   *  livello di zoom di quello di prima non c'entra niente con questo. */
  const azzera = useCallback(() => {
    setZoom(1)
    setOff({ x: 0, y: 0 })
  }, [])

  /* L'azzeramento al cambio scatto si fa QUI e non in un effetto.
     Farlo in un effetto significa disegnare prima la foto nuova con lo
     zoom della vecchia e poi correggerla: per un fotogramma si vede lo
     scatto sbagliato ingrandito nel punto sbagliato. Aggiustare lo
     stato durante il render e' il modo che React indica per rispondere
     a un cambio di prop — rende subito, senza il passaggio intermedio. */
  const [vistoUltimo, setVistoUltimo] = useState(indice)
  if (indice !== vistoUltimo) {
    setVistoUltimo(indice)
    setZoom(1)
    setOff({ x: 0, y: 0 })
  }

  /* Con il visore aperto la pagina sotto non deve scorrere: il gesto
     della rotella appartiene all'immagine, e una pagina che scivola via
     dietro il pannello fa perdere il punto in cui si era. */
  useEffect(() => {
    if (!aperto) return
    const prima = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prima
    }
  }, [aperto])

  /* Il fuoco entra nel pannello all'apertura: senza, la tastiera
     resterebbe sulla miniatura dietro e Esc non chiuderebbe niente. */
  useEffect(() => {
    if (aperto) chiudiBtn.current?.focus()
  }, [aperto])

  const vicino = zoom > 1

  /**
   * Quanto si puo' spostare l'inquadratura prima di tirare fuori
   * l'immagine dalla finestra. Senza questo limite si trascina nel
   * vuoto e si perde la foto fuori dallo schermo, che e' il modo piu'
   * veloce per non ritrovarla piu'.
   *
   * Si misura sull'immagine come e' DAVVERO disegnata (`getBoundingClientRect`
   * la restituisce gia' scalata), non sui suoi pixel originali: con
   * `object-contain` le due cose non coincidono quasi mai.
   */
  const limita = useCallback((x: number, y: number, z: number) => {
    const c = cornice.current
    if (!c) return { x, y }
    const img = c.querySelector('img')
    if (!img) return { x, y }

    // La dimensione a riposo: quella disegnata adesso, tolto lo zoom in
    // corso. Da li' si ricava quanta immagine sborda a `z`.
    const r = img.getBoundingClientRect()
    const largaOra = r.width / zoom
    const altaOra = r.height / zoom

    const maxX = Math.max(0, (largaOra * z - c.clientWidth) / 2)
    const maxY = Math.max(0, (altaOra * z - c.clientHeight) / 2)

    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    }
  }, [zoom])

  /**
   * Avvicina o allontana TENENDO FERMO IL PUNTO SOTTO IL PUNTATORE.
   *
   * E' la differenza fra uno zoom che serve e uno che fa perdere il
   * segno: se si ingrandisce sempre dal centro, la crepa che si stava
   * guardando in un angolo scappa fuori dall'inquadratura proprio
   * mentre ci si avvicina per vederla.
   *
   * `px`/`py` sono le coordinate del puntatore rispetto al centro della
   * cornice. Il punto dell'immagine che ci sta sotto e' `(px - off)/zoom`,
   * e deve restare lo stesso dopo: da li' esce l'offset nuovo.
   */
  const avvicina = useCallback(
    (fattore: number, px: number, py: number) => {
      setZoom((z) => {
        const nuovo = Math.min(MAX, Math.max(MIN, z * fattore))
        if (nuovo === z) return z

        setOff((o) => {
          // Tornati all'immagine intera si ricentra: a 1x non esiste un
          // "dove", e lasciarla storta sembrerebbe un difetto.
          if (nuovo === 1) return { x: 0, y: 0 }
          const k = nuovo / z
          return limita(px - (px - o.x) * k, py - (py - o.y) * k, nuovo)
        })
        return nuovo
      })
    },
    [limita],
  )

  /* La rotella e il pizzico del trackpad arrivano tutti e due come
     `wheel`. Si registra a mano con `passive: false` perche' React lo
     attacca in modo passivo e li' `preventDefault()` non funziona: la
     pagina sotto scorrerebbe lo stesso. */
  useEffect(() => {
    const c = cornice.current
    if (!aperto || !c) return

    const suRotella = (e: WheelEvent) => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      const px = e.clientX - r.left - r.width / 2
      const py = e.clientY - r.top - r.height / 2
      // Passo piccolo e proporzionale: il trackpad manda molti eventi
      // minuscoli, il mouse pochi e grossi, e cosi' rispondono uguale.
      avvicina(Math.exp(-e.deltaY * 0.002), px, py)
    }

    c.addEventListener('wheel', suRotella, { passive: false })
    return () => c.removeEventListener('wheel', suRotella)
  }, [aperto, avvicina])

  /* Tastiera: Esc chiude, le frecce cambiano scatto. Le frecce servono
     con lo scatto intero — da vicino spostano l'inquadratura, che e'
     cio' che ci si aspetta quando si sta esaminando un dettaglio. */
  useEffect(() => {
    if (!aperto) return

    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onChiudi()
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        avvicina(1.3, 0, 0)
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        avvicina(1 / 1.3, 0, 0)
        return
      }
      if (e.key === '0') {
        e.preventDefault()
        azzera()
        return
      }

      const passo = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
      if (passo === 0) return
      e.preventDefault()

      if (vicino) {
        setOff((o) => limita(o.x - passo * 60, o.y, zoom))
        return
      }
      if (scatti.length < 2) return
      // Gira in tondo: dall'ultimo si torna al primo, che su una manciata
      // di scatti e' piu' comodo di un tasto che smette di rispondere.
      onVai((indice! + passo + scatti.length) % scatti.length)
    }

    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [aperto, indice, scatti.length, vicino, zoom, limita, avvicina, azzera, onChiudi, onVai])

  if (!aperto || !scatto) return null

  const prendi = (e: React.PointerEvent) => {
    if (!vicino) return
    e.currentTarget.setPointerCapture(e.pointerId)
    trascina.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
    setInMano(true)
  }

  const muovi = (e: React.PointerEvent) => {
    const t = trascina.current
    if (!t) return
    setOff(limita(t.ox + (e.clientX - t.x), t.oy + (e.clientY - t.y), zoom))
  }

  const molla = () => {
    trascina.current = null
    setInMano(false)
  }

  const suDoppioClic = (e: React.MouseEvent) => {
    const c = cornice.current
    if (!c) return
    if (vicino) {
      azzera()
      return
    }
    const r = c.getBoundingClientRect()
    avvicina(2, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={scatto.titolo ?? 'Foto del cantiere'}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      /* Il clic sul fondo chiude, ma solo sul fondo: con l'immagine
         ingrandita si trascina di continuo e un rilascio fuori bordo
         chiuderebbe la finestra nel mezzo di un gesto. */
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onChiudi()
      }}
    >
      {/* ── testa ────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-white/20 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-white">
            {scatto.titolo || 'Foto del cantiere'}
          </p>
          {scatto.sottotitolo && (
            <p className="truncate text-xs font-semibold text-white/60">{scatto.sottotitolo}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {scatti.length > 1 && (
            <span className="rounded-full border-2 border-white/30 px-2.5 py-0.5 text-xs font-extrabold text-white">
              {indice! + 1} / {scatti.length}
            </span>
          )}

          <TastoVisore
            onClick={() => avvicina(1 / 1.4, 0, 0)}
            disabled={zoom <= MIN}
            etichetta="Allontana"
          >
            −
          </TastoVisore>
          {/* Il livello si legge e si azzera: cliccarlo riporta
              all'immagine intera, che e' la via d'uscita piu' corta
              quando ci si e' persi dentro un ingrandimento. */}
          <button
            type="button"
            onClick={azzera}
            className="min-w-[4rem] rounded-xl border-2 border-white/30 px-2 py-1 text-xs font-extrabold text-white hover:bg-white/10"
          >
            {Math.round(zoom * 100)}%
          </button>
          <TastoVisore
            onClick={() => avvicina(1.4, 0, 0)}
            disabled={zoom >= MAX}
            etichetta="Avvicina"
          >
            +
          </TastoVisore>

          {/* Scaricare resta: e' l'unico modo di portarsi la foto in un
              preventivo o in una mail, e prima lo dava il browser. */}
          <a
            href={scatto.url}
            target="_blank"
            rel="noreferrer"
            title="Apri l'originale in una scheda nuova"
            className="rounded-xl border-2 border-white/30 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-white/10"
          >
            Originale
          </a>

          <button
            ref={chiudiBtn}
            type="button"
            onClick={onChiudi}
            aria-label="Chiudi"
            className="rounded-xl border-2 border-white bg-amber-400 px-3 py-1 text-sm font-extrabold text-black"
          >
            Chiudi
          </button>
        </div>
      </div>

      {/* ── l'immagine ───────────────────────────────────────── */}
      <div
        ref={cornice}
        className={cn(
          'relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden',
          vicino ? (inMano ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
        )}
        onPointerDown={prendi}
        onPointerMove={muovi}
        onPointerUp={molla}
        onPointerCancel={molla}
        onDoubleClick={suDoppioClic}
      >
        <img
          key={scatto.url}
          src={scatto.url}
          alt={scatto.titolo ?? 'Foto del cantiere'}
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${off.x}px, ${off.y}px) scale(${zoom})`,
            // Senza transizione mentre si trascina: il ritardo di
            // rincorsa farebbe sembrare l'immagine incollata al mouse
            // con un elastico.
            transition: inMano ? 'none' : 'transform 120ms ease-out',
          }}
        />

        {scatti.length > 1 && (
          <>
            <Freccia
              verso="prima"
              onClick={() => onVai((indice! - 1 + scatti.length) % scatti.length)}
            />
            <Freccia verso="dopo" onClick={() => onVai((indice! + 1) % scatti.length)} />
          </>
        )}
      </div>

      {/* ── la riga che spiega i gesti ───────────────────────── */}
      <p className="shrink-0 border-t-2 border-white/20 px-4 py-2 text-center text-[11px] font-semibold text-white/60">
        Rotella o pizzico per avvicinare · doppio clic per lo stesso · trascina per spostarti
        {scatti.length > 1 && ' · ← → per lo scatto prima e dopo'} · Esc per chiudere
      </p>
    </div>
  )
}

function TastoVisore({
  children,
  onClick,
  disabled,
  etichetta,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  etichetta: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etichetta}
      title={etichetta}
      className="h-7 w-7 rounded-xl border-2 border-white/30 text-sm font-extrabold text-white hover:bg-white/10 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

/** Le frecce sullo scatto. Grosse e in mezzo all'altezza: si cercano
 *  con la coda dell'occhio mentre si guarda l'immagine, non si leggono. */
function Freccia({ verso, onClick }: { verso: 'prima' | 'dopo'; onClick: () => void }) {
  const prima = verso === 'prima'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={prima ? 'Scatto precedente' : 'Scatto successivo'}
      /* Lo stop serve: senza, il clic arriva anche alla cornice e fa
         partire un trascinamento che sposta l'immagine appena cambiata. */
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 rounded-xl border-2 border-white/40 bg-black/60 px-3 py-4 text-xl font-extrabold text-white hover:bg-black/90',
        prima ? 'left-3' : 'right-3',
      )}
    >
      <span aria-hidden="true">{prima ? '‹' : '›'}</span>
    </button>
  )
}
