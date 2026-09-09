import { useEffect, useId, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Avviso, Card, cn } from '../../ui'
import { useFoto, caricaFoto, eliminaFoto } from './useFoto'

/* ══════════════════════════════════════════════════════════════════
   Le foto dentro la scheda.

   Il riquadro si comporta in due modi, e la differenza non e' estetica:
   dipende dall'esistere o meno di un rapportino a cui attaccarle.

     scheda gia' salvata  la foto parte subito, appena scelta, e dopo un
                          attimo si vede nell'elenco delle salvate
     scheda nuova         il rapportino non esiste ancora, quindi non
                          c'e' niente a cui legare il file: le foto
                          restano in attesa e le carica chi salva

   La seconda strada esiste perche' l'alternativa - salva prima, poi
   rientra e metti le foto - in cantiere significa che le foto non le
   mette nessuno.
   ══════════════════════════════════════════════════════════════════ */

type Props = {
  /** C'e' solo quando il rapportino esiste gia'. In quel caso le foto
   *  salgono all'istante, senza passare dal salvataggio. */
  scheda?: { rapportinoId: string; orgId: string; cantiereId: string }
  /** Foto scelte e non ancora spedite, per la scheda che non c'e'
   *  ancora. Le tiene il form, perche' e' lui a salvare. */
  inAttesa: File[]
  onCambia: (file: File[]) => void
  /** Falso su una scheda gia' inviata: si guarda e non si tocca. */
  modificabile?: boolean
}

export function RiquadroFoto({ scheda, inAttesa, onCambia, modificabile = true }: Props) {
  const idCampo = useId()
  const qc = useQueryClient()
  const [erroreLocale, setErroreLocale] = useState<string | null>(null)

  const { data: salvate, isPending, error } = useFoto(scheda?.rapportinoId)

  const carica = useMutation({
    mutationFn: async (file: File[]) => {
      // Una alla volta: sulla connessione di un cantiere cinque
      // caricamenti in parallelo si intralciano, e se una fallisce si sa
      // quale.
      for (const f of file) {
        await caricaFoto({
          file: f,
          orgId: scheda!.orgId,
          cantiereId: scheda!.cantiereId,
          rapportinoId: scheda!.rapportinoId,
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foto', scheda?.rapportinoId] }),
  })

  const elimina = useMutation({
    mutationFn: eliminaFoto,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foto', scheda?.rapportinoId] }),
  })

  /* Le anteprime locali sono indirizzi che il browser tiene in memoria
     finche' non glieli si revoca. Senza il cleanup, un tecnico che prova
     e riprova dieci foto se le porta dietro tutte fino al reload. */
  const anteprime = useMemo(() => inAttesa.map((f) => URL.createObjectURL(f)), [inAttesa])
  useEffect(() => {
    return () => anteprime.forEach((url) => URL.revokeObjectURL(url))
  }, [anteprime])

  function scelte(elenco: FileList | null) {
    if (!elenco || elenco.length === 0) return
    setErroreLocale(null)

    const buoni: File[] = []
    for (const f of Array.from(elenco)) {
      // Il bucket accetta solo immagini e si ferma a 20 MB. Dirlo qui e'
      // piu' gentile che far partire il caricamento e farlo rimbalzare
      // dal server a meta' salita.
      if (!f.type.startsWith('image/')) {
        setErroreLocale(`${f.name} non è un'immagine.`)
        continue
      }
      if (f.size > 20 * 1024 * 1024) {
        setErroreLocale(`${f.name} supera i 20 MB.`)
        continue
      }
      buoni.push(f)
    }
    if (buoni.length === 0) return

    if (scheda) carica.mutate(buoni)
    else onCambia([...inAttesa, ...buoni])
  }

  const totale = (salvate?.length ?? 0) + inAttesa.length

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-black">Foto del cantiere</h2>
        {totale > 0 && <p className="text-xs font-bold text-gray-600">{totale} in tutto</p>}
      </div>

      {error && <Avviso tono="errore">Non riesco a leggere le foto: {error.message}</Avviso>}
      {erroreLocale && <Avviso tono="errore">{erroreLocale}</Avviso>}
      {carica.isError && <Avviso tono="errore">{(carica.error as Error).message}</Avviso>}
      {elimina.isError && (
        <Avviso tono="errore">
          Non riesco a togliere la foto: {(elimina.error as Error).message}
        </Avviso>
      )}

      {scheda && isPending ? (
        <p className="text-sm font-bold text-gray-600">Carico le foto…</p>
      ) : totale === 0 && !carica.isPending ? (
        <p className="rounded-xl border-2 border-dashed border-gray-400 px-4 py-6 text-center text-sm font-semibold text-gray-500">
          Nessuna foto su questa giornata.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(salvate ?? []).map((f) => (
            <Riquadrino
              key={f.id}
              url={f.url}
              onTogli={modificabile ? () => elimina.mutate(f) : undefined}
              inCorso={elimina.isPending && elimina.variables?.id === f.id}
            />
          ))}

          {inAttesa.map((file, i) => (
            <Riquadrino
              key={`${file.name}-${file.lastModified}-${i}`}
              url={anteprime[i]}
              inAttesa
              onTogli={() => onCambia(inAttesa.filter((_, j) => j !== i))}
            />
          ))}

          {carica.isPending && (
            <li className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-black bg-amber-50 text-center text-xs font-bold text-black">
              Sto caricando…
            </li>
          )}
        </ul>
      )}

      {modificabile && (
        <div>
          {/* Un input file vero, nascosto dietro una label: quello di
              serie non si puo' vestire, e sul telefono la label apre lo
              stesso il menu con fotocamera e galleria. */}
          <input
            id={idCampo}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={carica.isPending}
            onChange={(e) => {
              scelte(e.target.files)
              // Azzerare permette di riscegliere lo stesso file dopo
              // averlo tolto: senza, il browser non emette l'evento.
              e.target.value = ''
            }}
          />
          <label
            htmlFor={idCampo}
            className={cn(
              'neo-press inline-block rounded-xl border-2 border-black bg-amber-50 px-4 py-2.5 text-sm font-bold',
              carica.isPending ? 'cursor-default opacity-50' : 'cursor-pointer',
            )}
          >
            + Aggiungi foto
          </label>
          <p className="mt-2 text-xs font-semibold text-gray-600">
            Restano legate a questo cantiere e a questa data. Le foto grandi vengono
            rimpicciolite prima di partire, così il caricamento regge anche col campo debole.
          </p>
        </div>
      )}
    </Card>
  )
}

function Riquadrino({
  url,
  onTogli,
  inAttesa = false,
  inCorso = false,
}: {
  url: string | null
  onTogli?: () => void
  inAttesa?: boolean
  inCorso?: boolean
}) {
  return (
    <li className="relative">
      <div
        className={cn(
          'aspect-square overflow-hidden rounded-xl border-2 border-black bg-gray-100',
          inAttesa && 'border-dashed',
        )}
      >
        {url ? (
          <img
            src={url}
            alt={inAttesa ? 'Foto da caricare' : 'Foto del cantiere'}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[11px] font-bold text-gray-500">
            Anteprima non disponibile
          </div>
        )}
      </div>

      {onTogli && (
        <button
          type="button"
          onClick={onTogli}
          disabled={inCorso}
          aria-label="Togli questa foto"
          title="Togli questa foto"
          className="neo-press absolute -right-2 -top-2 h-7 w-7 cursor-pointer rounded-lg border-2 border-black bg-white text-sm font-extrabold leading-none hover:bg-rose-200 disabled:cursor-default disabled:opacity-50"
        >
          {inCorso ? '…' : '×'}
        </button>
      )}
    </li>
  )
}
