import { useSearchParams } from 'react-router'
import { oggi } from '../rapportini/campiRapportino'

/**
 * Una data della home tenuta nell'indirizzo invece che in memoria.
 *
 * Nasce il 2026-09-23: «se sono dentro il 17 settembre e sto vedendo i
 * cantieri uno per uno, quando torno indietro col tasto back non devo
 * ritornare alla home di oggi ma a quella del 17». Con `useState` la
 * data moriva appena si apriva un rapportino, e il tasto indietro
 * ricostruiva la home da zero, cioe' da oggi.
 *
 * Nell'indirizzo la data sopravvive: il browser torna a `/?data=…` e la
 * home riparte da li'.
 *
 * `replace` e non `push`: sfogliare dieci giorni con le frecce non deve
 * lasciare dieci passi nella cronologia, o per uscire dalla home si
 * dovrebbe premere indietro dieci volte.
 *
 * Un valore fuori formato o nel futuro viene ignorato invece che
 * creduto, perche' l'indirizzo lo puo' scrivere chiunque.
 */
export function useDataInIndirizzo(nome: string) {
  const [params, setParams] = useSearchParams()
  const grezzo = params.get(nome)
  const valore =
    grezzo && /^\d{4}-\d{2}-\d{2}$/.test(grezzo) && grezzo <= oggi() ? grezzo : null

  function imposta(data: string | null) {
    setParams(
      (prec) => {
        const nuovi = new URLSearchParams(prec)
        if (data) nuovi.set(nome, data)
        else nuovi.delete(nome)
        return nuovi
      },
      { replace: true },
    )
  }

  return [valore, imposta] as const
}
