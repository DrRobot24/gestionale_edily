export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          org_id: string | null
          target_id: string | null
          target_type: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          org_id?: string | null
          target_id?: string | null
          target_type: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          org_id?: string | null
          target_id?: string | null
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cantiere_assegnazioni: {
        Row: {
          al: string | null
          cantiere_id: string
          created_at: string
          dal: string
          id: string
          org_id: string
          ruolo_cantiere: string
          user_id: string
        }
        Insert: {
          al?: string | null
          cantiere_id: string
          created_at?: string
          dal?: string
          id?: string
          org_id: string
          ruolo_cantiere?: string
          user_id: string
        }
        Update: {
          al?: string | null
          cantiere_id?: string
          created_at?: string
          dal?: string
          id?: string
          org_id?: string
          ruolo_cantiere?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cantiere_assegnazioni_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cantiere_assegnazioni_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "cantiere_assegnazioni_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "cantiere_assegnazioni_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cantieri: {
        Row: {
          cap: string | null
          cliente_id: string | null
          codice: string
          comune: string | null
          created_at: string
          data_fine_effettiva: string | null
          data_fine_prevista: string | null
          data_inizio: string | null
          denominazione: string
          id: string
          importo_contratto: number | null
          indirizzo: string | null
          latitudine: number | null
          longitudine: number | null
          note: string | null
          org_id: string
          provincia: string | null
          responsabile_id: string | null
          stato: Database["public"]["Enums"]["cantiere_stato"]
          updated_at: string
        }
        Insert: {
          cap?: string | null
          cliente_id?: string | null
          codice: string
          comune?: string | null
          created_at?: string
          data_fine_effettiva?: string | null
          data_fine_prevista?: string | null
          data_inizio?: string | null
          denominazione: string
          id?: string
          importo_contratto?: number | null
          indirizzo?: string | null
          latitudine?: number | null
          longitudine?: number | null
          note?: string | null
          org_id: string
          provincia?: string | null
          responsabile_id?: string | null
          stato?: Database["public"]["Enums"]["cantiere_stato"]
          updated_at?: string
        }
        Update: {
          cap?: string | null
          cliente_id?: string | null
          codice?: string
          comune?: string | null
          created_at?: string
          data_fine_effettiva?: string | null
          data_fine_prevista?: string | null
          data_inizio?: string | null
          denominazione?: string
          id?: string
          importo_contratto?: number | null
          indirizzo?: string | null
          latitudine?: number | null
          longitudine?: number | null
          note?: string | null
          org_id?: string
          provincia?: string | null
          responsabile_id?: string | null
          stato?: Database["public"]["Enums"]["cantiere_stato"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cantieri_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cantieri_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clienti: {
        Row: {
          attivo: boolean
          cap: string | null
          codice_fiscale: string | null
          codice_sdi: string | null
          comune: string | null
          created_at: string
          email: string | null
          id: string
          indirizzo: string | null
          note: string | null
          org_id: string
          partita_iva: string | null
          pec: string | null
          provincia: string | null
          ragione_sociale: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          cap?: string | null
          codice_fiscale?: string | null
          codice_sdi?: string | null
          comune?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          note?: string | null
          org_id: string
          partita_iva?: string | null
          pec?: string | null
          provincia?: string | null
          ragione_sociale: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          cap?: string | null
          codice_fiscale?: string | null
          codice_sdi?: string | null
          comune?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          note?: string | null
          org_id?: string
          partita_iva?: string | null
          pec?: string | null
          provincia?: string | null
          ragione_sociale?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clienti_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      costi_cantiere: {
        Row: {
          cantiere_id: string
          created_at: string
          data: string
          descrizione: string
          fornitore_id: string | null
          id: string
          imponibile: number
          iva: number
          org_id: string
          registrato_da: string | null
          riferimento: string | null
          tipo: string
          wbs_task_id: string | null
        }
        Insert: {
          cantiere_id: string
          created_at?: string
          data: string
          descrizione: string
          fornitore_id?: string | null
          id?: string
          imponibile?: number
          iva?: number
          org_id: string
          registrato_da?: string | null
          riferimento?: string | null
          tipo: string
          wbs_task_id?: string | null
        }
        Update: {
          cantiere_id?: string
          created_at?: string
          data?: string
          descrizione?: string
          fornitore_id?: string | null
          id?: string
          imponibile?: number
          iva?: number
          org_id?: string
          registrato_da?: string | null
          riferimento?: string | null
          tipo?: string
          wbs_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costi_cantiere_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costi_cantiere_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "costi_cantiere_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "costi_cantiere_fornitore_id_fkey"
            columns: ["fornitore_id"]
            isOneToOne: false
            referencedRelation: "fornitori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costi_cantiere_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costi_cantiere_wbs_task_id_fkey"
            columns: ["wbs_task_id"]
            isOneToOne: false
            referencedRelation: "v_avanzamento_wbs"
            referencedColumns: ["wbs_task_id"]
          },
          {
            foreignKeyName: "costi_cantiere_wbs_task_id_fkey"
            columns: ["wbs_task_id"]
            isOneToOne: false
            referencedRelation: "wbs_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dipendente_costi: {
        Row: {
          costo_orario: number
          costo_orario_straordinario: number | null
          created_at: string
          dipendente_id: string
          id: string
          note: string | null
          org_id: string
          tariffa_vendita_oraria: number | null
          valido_dal: string
        }
        Insert: {
          costo_orario: number
          costo_orario_straordinario?: number | null
          created_at?: string
          dipendente_id: string
          id?: string
          note?: string | null
          org_id: string
          tariffa_vendita_oraria?: number | null
          valido_dal: string
        }
        Update: {
          costo_orario?: number
          costo_orario_straordinario?: number | null
          created_at?: string
          dipendente_id?: string
          id?: string
          note?: string | null
          org_id?: string
          tariffa_vendita_oraria?: number | null
          valido_dal?: string
        }
        Relationships: [
          {
            foreignKeyName: "dipendente_costi_dipendente_id_fkey"
            columns: ["dipendente_id"]
            isOneToOne: false
            referencedRelation: "dipendenti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dipendente_costi_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dipendenti: {
        Row: {
          attivo: boolean
          codice_fiscale: string | null
          cognome: string
          created_at: string
          data_assunzione: string | null
          data_cessazione: string | null
          email: string | null
          id: string
          livello_ccnl: string | null
          mansione: string | null
          matricola: string | null
          nome: string
          org_id: string
          telefono: string | null
          tipo_contratto: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attivo?: boolean
          codice_fiscale?: string | null
          cognome: string
          created_at?: string
          data_assunzione?: string | null
          data_cessazione?: string | null
          email?: string | null
          id?: string
          livello_ccnl?: string | null
          mansione?: string | null
          matricola?: string | null
          nome: string
          org_id: string
          telefono?: string | null
          tipo_contratto?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attivo?: boolean
          codice_fiscale?: string | null
          cognome?: string
          created_at?: string
          data_assunzione?: string | null
          data_cessazione?: string | null
          email?: string | null
          id?: string
          livello_ccnl?: string | null
          mansione?: string | null
          matricola?: string | null
          nome?: string
          org_id?: string
          telefono?: string | null
          tipo_contratto?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dipendenti_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_counters: {
        Row: {
          anno: number
          org_id: string
          tipo: string
          ultimo: number
        }
        Insert: {
          anno: number
          org_id: string
          tipo: string
          ultimo?: number
        }
        Update: {
          anno?: number
          org_id?: string
          tipo?: string
          ultimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fornitori: {
        Row: {
          attivo: boolean
          cap: string | null
          categoria: string | null
          comune: string | null
          created_at: string
          email: string | null
          id: string
          indirizzo: string | null
          note: string | null
          org_id: string
          partita_iva: string | null
          pec: string | null
          provincia: string | null
          ragione_sociale: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          cap?: string | null
          categoria?: string | null
          comune?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          note?: string | null
          org_id: string
          partita_iva?: string | null
          pec?: string | null
          provincia?: string | null
          ragione_sociale: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          cap?: string | null
          categoria?: string | null
          comune?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          note?: string | null
          org_id?: string
          partita_iva?: string | null
          pec?: string | null
          provincia?: string | null
          ragione_sociale?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornitori_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      materiali: {
        Row: {
          attivo: boolean
          codice: string | null
          created_at: string
          descrizione: string
          fornitore_id: string | null
          id: string
          org_id: string
          prezzo_ultimo: number | null
          unita_misura: string
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          codice?: string | null
          created_at?: string
          descrizione: string
          fornitore_id?: string | null
          id?: string
          org_id: string
          prezzo_ultimo?: number | null
          unita_misura?: string
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          codice?: string | null
          created_at?: string
          descrizione?: string
          fornitore_id?: string | null
          id?: string
          org_id?: string
          prezzo_ultimo?: number | null
          unita_misura?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materiali_fornitore_id_fkey"
            columns: ["fornitore_id"]
            isOneToOne: false
            referencedRelation: "fornitori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiali_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          attivo: boolean
          created_at: string
          id: string
          invitato_da: string | null
          org_id: string
          ruolo: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          attivo?: boolean
          created_at?: string
          id?: string
          invitato_da?: string | null
          org_id: string
          ruolo?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          attivo?: boolean
          created_at?: string
          id?: string
          invitato_da?: string | null
          org_id?: string
          ruolo?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mezzi: {
        Row: {
          attivo: boolean
          codice: string | null
          created_at: string
          descrizione: string
          fornitore_id: string | null
          id: string
          org_id: string
          proprieta: string
          scadenza_assicurazione: string | null
          scadenza_revisione: string | null
          targa: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          codice?: string | null
          created_at?: string
          descrizione: string
          fornitore_id?: string | null
          id?: string
          org_id: string
          proprieta?: string
          scadenza_assicurazione?: string | null
          scadenza_revisione?: string | null
          targa?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          codice?: string | null
          created_at?: string
          descrizione?: string
          fornitore_id?: string | null
          id?: string
          org_id?: string
          proprieta?: string
          scadenza_assicurazione?: string | null
          scadenza_revisione?: string | null
          targa?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mezzi_fornitore_id_fkey"
            columns: ["fornitore_id"]
            isOneToOne: false
            referencedRelation: "fornitori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mezzi_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mezzo_costi: {
        Row: {
          costo_km: number
          costo_orario: number
          created_at: string
          id: string
          mezzo_id: string
          org_id: string
          valido_dal: string
        }
        Insert: {
          costo_km?: number
          costo_orario?: number
          created_at?: string
          id?: string
          mezzo_id: string
          org_id: string
          valido_dal: string
        }
        Update: {
          costo_km?: number
          costo_orario?: number
          created_at?: string
          id?: string
          mezzo_id?: string
          org_id?: string
          valido_dal?: string
        }
        Relationships: [
          {
            foreignKeyName: "mezzo_costi_mezzo_id_fkey"
            columns: ["mezzo_id"]
            isOneToOne: false
            referencedRelation: "mezzi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mezzo_costi_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_inviti: {
        Row: {
          accettato_il: string | null
          created_at: string
          creato_da: string
          email: string
          id: string
          org_id: string
          ruolo: Database["public"]["Enums"]["org_role"]
          scade_il: string
          token: string
        }
        Insert: {
          accettato_il?: string | null
          created_at?: string
          creato_da: string
          email: string
          id?: string
          org_id: string
          ruolo?: Database["public"]["Enums"]["org_role"]
          scade_il?: string
          token?: string
        }
        Update: {
          accettato_il?: string | null
          created_at?: string
          creato_da?: string
          email?: string
          id?: string
          org_id?: string
          ruolo?: Database["public"]["Enums"]["org_role"]
          scade_il?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_inviti_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          attiva: boolean
          cap: string | null
          codice_fiscale: string | null
          comune: string | null
          created_at: string
          email: string | null
          id: string
          indirizzo: string | null
          logo_url: string | null
          partita_iva: string | null
          piano: string
          provincia: string | null
          ragione_sociale: string
          slug: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          attiva?: boolean
          cap?: string | null
          codice_fiscale?: string | null
          comune?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          logo_url?: string | null
          partita_iva?: string | null
          piano?: string
          provincia?: string | null
          ragione_sociale: string
          slug: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          attiva?: boolean
          cap?: string | null
          codice_fiscale?: string | null
          comune?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          logo_url?: string | null
          partita_iva?: string | null
          piano?: string
          provincia?: string | null
          ragione_sociale?: string
          slug?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      periodi_paga: {
        Row: {
          anno: number
          chiuso_at: string | null
          chiuso_da: string | null
          id: string
          mese: number
          note: string | null
          org_id: string
          stato: string
        }
        Insert: {
          anno: number
          chiuso_at?: string | null
          chiuso_da?: string | null
          id?: string
          mese: number
          note?: string | null
          org_id: string
          stato?: string
        }
        Update: {
          anno?: number
          chiuso_at?: string | null
          chiuso_da?: string | null
          id?: string
          mese?: number
          note?: string | null
          org_id?: string
          stato?: string
        }
        Relationships: [
          {
            foreignKeyName: "periodi_paga_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          descrizione: string
          modulo: string
        }
        Insert: {
          code: string
          descrizione: string
          modulo: string
        }
        Update: {
          code?: string
          descrizione?: string
          modulo?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string
          is_platform_admin: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      project_shares: {
        Row: {
          created_at: string | null
          id: string
          project_id: string
          shared_by: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id: string
          shared_by: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string
          shared_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cantiere_id: string | null
          created_at: string | null
          data: Json
          id: string
          org_id: string | null
          titolo: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cantiere_id?: string | null
          created_at?: string | null
          data?: Json
          id?: string
          org_id?: string | null
          titolo?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cantiere_id?: string | null
          created_at?: string | null
          data?: Json
          id?: string
          org_id?: string | null
          titolo?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "projects_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rapportini: {
        Row: {
          anno: number
          cantiere_id: string
          compilato_da: string
          contabilizzato_at: string | null
          created_at: string
          data: string
          firma_url: string | null
          id: string
          inviato_at: string | null
          meteo: string | null
          motivo_rifiuto: string | null
          note: string | null
          numero: number | null
          ora_fine: string | null
          ora_inizio: string | null
          org_id: string
          stato: Database["public"]["Enums"]["rapportino_stato"]
          updated_at: string
          validato_at: string | null
          validato_da: string | null
        }
        Insert: {
          anno?: number
          cantiere_id: string
          compilato_da: string
          contabilizzato_at?: string | null
          created_at?: string
          data: string
          firma_url?: string | null
          id?: string
          inviato_at?: string | null
          meteo?: string | null
          motivo_rifiuto?: string | null
          note?: string | null
          numero?: number | null
          ora_fine?: string | null
          ora_inizio?: string | null
          org_id: string
          stato?: Database["public"]["Enums"]["rapportino_stato"]
          updated_at?: string
          validato_at?: string | null
          validato_da?: string | null
        }
        Update: {
          anno?: number
          cantiere_id?: string
          compilato_da?: string
          contabilizzato_at?: string | null
          created_at?: string
          data?: string
          firma_url?: string | null
          id?: string
          inviato_at?: string | null
          meteo?: string | null
          motivo_rifiuto?: string | null
          note?: string | null
          numero?: number | null
          ora_fine?: string | null
          ora_inizio?: string | null
          org_id?: string
          stato?: Database["public"]["Enums"]["rapportino_stato"]
          updated_at?: string
          validato_at?: string | null
          validato_da?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "rapportini_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rapportino_foto: {
        Row: {
          created_at: string
          didascalia: string | null
          id: string
          org_id: string
          rapportino_id: string
          scattata_at: string | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          didascalia?: string | null
          id?: string
          org_id: string
          rapportino_id: string
          scattata_at?: string | null
          storage_path: string
        }
        Update: {
          created_at?: string
          didascalia?: string | null
          id?: string
          org_id?: string
          rapportino_id?: string
          scattata_at?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "rapportino_foto_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_foto_rapportino_id_fkey"
            columns: ["rapportino_id"]
            isOneToOne: false
            referencedRelation: "rapportini"
            referencedColumns: ["id"]
          },
        ]
      }
      rapportino_materiali: {
        Row: {
          descrizione: string | null
          fornitore_id: string | null
          id: string
          materiale_id: string | null
          note: string | null
          org_id: string
          quantita: number
          rapportino_id: string
          riferimento_ddt: string | null
          unita_misura: string | null
        }
        Insert: {
          descrizione?: string | null
          fornitore_id?: string | null
          id?: string
          materiale_id?: string | null
          note?: string | null
          org_id: string
          quantita?: number
          rapportino_id: string
          riferimento_ddt?: string | null
          unita_misura?: string | null
        }
        Update: {
          descrizione?: string | null
          fornitore_id?: string | null
          id?: string
          materiale_id?: string | null
          note?: string | null
          org_id?: string
          quantita?: number
          rapportino_id?: string
          riferimento_ddt?: string | null
          unita_misura?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rapportino_materiali_fornitore_id_fkey"
            columns: ["fornitore_id"]
            isOneToOne: false
            referencedRelation: "fornitori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_materiali_materiale_id_fkey"
            columns: ["materiale_id"]
            isOneToOne: false
            referencedRelation: "materiali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_materiali_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_materiali_rapportino_id_fkey"
            columns: ["rapportino_id"]
            isOneToOne: false
            referencedRelation: "rapportini"
            referencedColumns: ["id"]
          },
        ]
      }
      rapportino_mezzi: {
        Row: {
          id: string
          km: number
          mezzo_id: string
          note: string | null
          ore_utilizzo: number
          org_id: string
          rapportino_id: string
        }
        Insert: {
          id?: string
          km?: number
          mezzo_id: string
          note?: string | null
          ore_utilizzo?: number
          org_id: string
          rapportino_id: string
        }
        Update: {
          id?: string
          km?: number
          mezzo_id?: string
          note?: string | null
          ore_utilizzo?: number
          org_id?: string
          rapportino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rapportino_mezzi_mezzo_id_fkey"
            columns: ["mezzo_id"]
            isOneToOne: false
            referencedRelation: "mezzi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_mezzi_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_mezzi_rapportino_id_fkey"
            columns: ["rapportino_id"]
            isOneToOne: false
            referencedRelation: "rapportini"
            referencedColumns: ["id"]
          },
        ]
      }
      rapportino_ore: {
        Row: {
          created_at: string
          dipendente_id: string
          id: string
          mansione: string | null
          note: string | null
          ore_ordinarie: number
          ore_straordinarie: number
          ore_trasferta: number
          org_id: string
          rapportino_id: string
          tipo_assenza: string | null
          wbs_task_id: string | null
        }
        Insert: {
          created_at?: string
          dipendente_id: string
          id?: string
          mansione?: string | null
          note?: string | null
          ore_ordinarie?: number
          ore_straordinarie?: number
          ore_trasferta?: number
          org_id: string
          rapportino_id: string
          tipo_assenza?: string | null
          wbs_task_id?: string | null
        }
        Update: {
          created_at?: string
          dipendente_id?: string
          id?: string
          mansione?: string | null
          note?: string | null
          ore_ordinarie?: number
          ore_straordinarie?: number
          ore_trasferta?: number
          org_id?: string
          rapportino_id?: string
          tipo_assenza?: string | null
          wbs_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rapportino_ore_dipendente_id_fkey"
            columns: ["dipendente_id"]
            isOneToOne: false
            referencedRelation: "dipendenti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_ore_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_ore_rapportino_id_fkey"
            columns: ["rapportino_id"]
            isOneToOne: false
            referencedRelation: "rapportini"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_ore_wbs_task_id_fkey"
            columns: ["wbs_task_id"]
            isOneToOne: false
            referencedRelation: "v_avanzamento_wbs"
            referencedColumns: ["wbs_task_id"]
          },
          {
            foreignKeyName: "rapportino_ore_wbs_task_id_fkey"
            columns: ["wbs_task_id"]
            isOneToOne: false
            referencedRelation: "wbs_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ricavi_cantiere: {
        Row: {
          cantiere_id: string
          created_at: string
          data: string
          data_incasso: string | null
          descrizione: string | null
          id: string
          imponibile: number
          incassato: boolean
          iva: number
          org_id: string
          riferimento: string | null
          tipo: string
        }
        Insert: {
          cantiere_id: string
          created_at?: string
          data: string
          data_incasso?: string | null
          descrizione?: string | null
          id?: string
          imponibile?: number
          incassato?: boolean
          iva?: number
          org_id: string
          riferimento?: string | null
          tipo?: string
        }
        Update: {
          cantiere_id?: string
          created_at?: string
          data?: string
          data_incasso?: string | null
          descrizione?: string | null
          id?: string
          imponibile?: number
          incassato?: boolean
          iva?: number
          org_id?: string
          riferimento?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ricavi_cantiere_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ricavi_cantiere_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "ricavi_cantiere_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "ricavi_cantiere_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          ruolo: Database["public"]["Enums"]["org_role"]
        }
        Insert: {
          permission: string
          ruolo: Database["public"]["Enums"]["org_role"]
        }
        Update: {
          permission?: string
          ruolo?: Database["public"]["Enums"]["org_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      wbs_tasks: {
        Row: {
          archiviato: boolean
          cantiere_id: string | null
          codice: string | null
          costo_reale: number | null
          data_fine: string | null
          data_inizio: string | null
          descrizione: string | null
          foglia: boolean | null
          id: string
          importo_previsto: number | null
          livello: number | null
          n_fatture: number | null
          n_materiali: number | null
          note: string | null
          ordine: number | null
          ore_previste: number | null
          org_id: string | null
          parent_key: string | null
          percentuale: number | null
          priorita: string | null
          project_id: string
          responsabile: string | null
          stato: string | null
          synced_at: string
          task_key: string
        }
        Insert: {
          archiviato?: boolean
          cantiere_id?: string | null
          codice?: string | null
          costo_reale?: number | null
          data_fine?: string | null
          data_inizio?: string | null
          descrizione?: string | null
          foglia?: boolean | null
          id?: string
          importo_previsto?: number | null
          livello?: number | null
          n_fatture?: number | null
          n_materiali?: number | null
          note?: string | null
          ordine?: number | null
          ore_previste?: number | null
          org_id?: string | null
          parent_key?: string | null
          percentuale?: number | null
          priorita?: string | null
          project_id: string
          responsabile?: string | null
          stato?: string | null
          synced_at?: string
          task_key: string
        }
        Update: {
          archiviato?: boolean
          cantiere_id?: string | null
          codice?: string | null
          costo_reale?: number | null
          data_fine?: string | null
          data_inizio?: string | null
          descrizione?: string | null
          foglia?: boolean | null
          id?: string
          importo_previsto?: number | null
          livello?: number | null
          n_fatture?: number | null
          n_materiali?: number | null
          note?: string | null
          ordine?: number | null
          ore_previste?: number | null
          org_id?: string | null
          parent_key?: string | null
          percentuale?: number | null
          priorita?: string | null
          project_id?: string
          responsabile?: string | null
          stato?: string | null
          synced_at?: string
          task_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "wbs_tasks_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wbs_tasks_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "wbs_tasks_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "wbs_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_avanzamento_wbs: {
        Row: {
          avanzamento_dichiarato: number | null
          budget: number | null
          cantiere_id: string | null
          costo_manodopera: number | null
          descrizione: string | null
          livello: number | null
          ore_consuntivate: number | null
          org_id: string | null
          percentuale_budget_consumato: number | null
          stato: string | null
          task_key: string | null
          wbs_task_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wbs_tasks_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wbs_tasks_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "wbs_tasks_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
        ]
      }
      v_costo_manodopera: {
        Row: {
          cantiere_id: string | null
          costo_manodopera: number | null
          ore_totali: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "rapportini_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_costo_mezzi: {
        Row: {
          cantiere_id: string | null
          costo_mezzi: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "rapportini_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_margine_cantiere: {
        Row: {
          cantiere_id: string | null
          codice: string | null
          costi_diretti: number | null
          costo_manodopera: number | null
          costo_mezzi: number | null
          costo_totale: number | null
          denominazione: string | null
          importo_contratto: number | null
          margine: number | null
          ore_consuntivate: number | null
          org_id: string | null
          ricavi_maturati: number | null
          stato: Database["public"]["Enums"]["cantiere_stato"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cantieri_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ore_giornaliere: {
        Row: {
          cantiere: string | null
          cantiere_codice: string | null
          cantiere_id: string | null
          data: string | null
          dipendente: string | null
          dipendente_id: string | null
          ore_ordinarie: number | null
          ore_straordinarie: number | null
          ore_totali: number | null
          ore_trasferta: number | null
          org_id: string | null
          stato: Database["public"]["Enums"]["rapportino_stato"] | null
          tipo_assenza: string | null
          wbs_task_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_margine_cantiere"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "rapportini_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "v_rapportini_mancanti"
            referencedColumns: ["cantiere_id"]
          },
          {
            foreignKeyName: "rapportini_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_ore_dipendente_id_fkey"
            columns: ["dipendente_id"]
            isOneToOne: false
            referencedRelation: "dipendenti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_ore_wbs_task_id_fkey"
            columns: ["wbs_task_id"]
            isOneToOne: false
            referencedRelation: "v_avanzamento_wbs"
            referencedColumns: ["wbs_task_id"]
          },
          {
            foreignKeyName: "rapportino_ore_wbs_task_id_fkey"
            columns: ["wbs_task_id"]
            isOneToOne: false
            referencedRelation: "wbs_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      v_rapportini_mancanti: {
        Row: {
          cantiere_id: string | null
          codice: string | null
          denominazione: string | null
          giorno: string | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cantieri_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_riepilogo_paghe: {
        Row: {
          anno: number | null
          dipendente: string | null
          dipendente_id: string | null
          giorni_lavorati: number | null
          matricola: string | null
          mese: number | null
          ore_ordinarie: number | null
          ore_straordinarie: number | null
          ore_trasferta: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rapportini_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapportino_ore_dipendente_id_fkey"
            columns: ["dipendente_id"]
            isOneToOne: false
            referencedRelation: "dipendenti"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      chiudi_periodo_paga: {
        Args: { p_anno: number; p_mese: number; p_org: string }
        Returns: number
      }
      get_projects_by_ids: {
        Args: { project_ids: string[] }
        Returns: {
          data: Json
          id: string
          titolo: string
          updated_at: string
          user_id: string
        }[]
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
    }
    Enums: {
      cantiere_stato:
        | "in_preparazione"
        | "attivo"
        | "sospeso"
        | "chiuso"
        | "archiviato"
      org_role:
        | "owner"
        | "admin"
        | "amministrazione"
        | "capocantiere"
        | "tecnico"
        | "lettore"
      rapportino_stato:
        | "bozza"
        | "inviato"
        | "respinto"
        | "validato"
        | "contabilizzato"
      user_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cantiere_stato: [
        "in_preparazione",
        "attivo",
        "sospeso",
        "chiuso",
        "archiviato",
      ],
      org_role: [
        "owner",
        "admin",
        "amministrazione",
        "capocantiere",
        "tecnico",
        "lettore",
      ],
      rapportino_stato: [
        "bozza",
        "inviato",
        "respinto",
        "validato",
        "contabilizzato",
      ],
      user_role: ["admin", "moderator", "user"],
    },
  },
} as const
