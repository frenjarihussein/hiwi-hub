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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      _probe: {
        Row: {
          id: number
        }
        Insert: {
          id: number
        }
        Update: {
          id?: number
        }
        Relationships: []
      }
      _restore_req: {
        Row: {
          id: number | null
        }
        Insert: {
          id?: number | null
        }
        Update: {
          id?: number | null
        }
        Relationships: []
      }
      _stg_auth_identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: Json
          last_sign_in_at: string | null
          provider: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          identity_data: Json
          last_sign_in_at?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data?: Json
          last_sign_in_at?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      _stg_auth_users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      accounts: {
        Row: {
          balance_side: string | null
          cash_flow_type: string | null
          closing_account_id: string | null
          closing_type: string | null
          code: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          entity_generated: boolean
          id: string
          is_active: boolean
          is_group: boolean
          is_monetary: boolean
          name: string
          name_en: string | null
          nature: Database["public"]["Enums"]["account_nature"]
          notes: string | null
          parent_id: string | null
          tenant_id: string
        }
        Insert: {
          balance_side?: string | null
          cash_flow_type?: string | null
          closing_account_id?: string | null
          closing_type?: string | null
          code: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          entity_generated?: boolean
          id?: string
          is_active?: boolean
          is_group?: boolean
          is_monetary?: boolean
          name: string
          name_en?: string | null
          nature?: Database["public"]["Enums"]["account_nature"]
          notes?: string | null
          parent_id?: string | null
          tenant_id: string
        }
        Update: {
          balance_side?: string | null
          cash_flow_type?: string | null
          closing_account_id?: string | null
          closing_type?: string | null
          code?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          entity_generated?: boolean
          id?: string
          is_active?: boolean
          is_group?: boolean
          is_monetary?: boolean
          name?: string
          name_en?: string | null
          nature?: Database["public"]["Enums"]["account_nature"]
          notes?: string | null
          parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_closing_account_id_fkey"
            columns: ["closing_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_drafts: {
        Row: {
          created_at: string
          created_by: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: string
          payload: Json
          result_id: string | null
          status: string
          tenant_id: string
          thread_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: string
          payload: Json
          result_id?: string | null
          status?: string
          tenant_id?: string
          thread_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: string
          payload?: Json
          result_id?: string | null
          status?: string
          tenant_id?: string
          thread_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          created_at: string
          id: string
          msg_id: string
          parts: Json
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          msg_id: string
          parts?: Json
          role: string
          thread_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          msg_id?: string
          parts?: Json
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_threads: {
        Row: {
          created_at: string
          id: string
          tenant_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value?: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          amount: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          entity_id: string
          entity_type: string
          id: string
          note: string | null
          requested_by: string
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id: string
          entity_type: string
          id?: string
          note?: string | null
          requested_by?: string
          status?: string
          tenant_id?: string
          title: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          note?: string | null
          requested_by?: string
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_vouchers: {
        Row: {
          components: Json
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          mode: string
          notes: string | null
          product_id: string
          qty: number
          tenant_id: string
          to_warehouse_id: string | null
          total_cost: number
          voucher_date: string
          voucher_no: number
          warehouse_id: string
        }
        Insert: {
          components?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          mode: string
          notes?: string | null
          product_id: string
          qty: number
          tenant_id: string
          to_warehouse_id?: string | null
          total_cost?: number
          voucher_date?: string
          voucher_no?: number
          warehouse_id: string
        }
        Update: {
          components?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          mode?: string
          notes?: string | null
          product_id?: string
          qty?: number
          tenant_id?: string
          to_warehouse_id?: string | null
          total_cost?: number
          voucher_date?: string
          voucher_no?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_vouchers_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_vouchers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_vouchers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_vouchers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_vouchers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          attach_type: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          size_bytes: number | null
          tenant_id: string
        }
        Insert: {
          attach_type?: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          tenant_id: string
        }
        Update: {
          attach_type?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backups: {
        Row: {
          created_at: string
          file_path: string
          id: string
          size_bytes: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          size_bytes?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          size_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_recon_marks: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_line_id: string
          statement_date: string
          statement_ref: string | null
          tenant_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_line_id: string
          statement_date?: string
          statement_ref?: string | null
          tenant_id?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_line_id?: string
          statement_date?: string
          statement_ref?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_recon_marks_journal_line_id_fkey"
            columns: ["journal_line_id"]
            isOneToOne: true
            referencedRelation: "journal_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          account_id: string | null
          account_no: string | null
          branch: string | null
          branch_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          account_no?: string | null
          branch?: string | null
          branch_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          account_no?: string | null
          branch?: string | null
          branch_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_consumptions: {
        Row: {
          batch_id: string
          id: string
          move_id: string
          qty: number
          tenant_id: string
        }
        Insert: {
          batch_id: string
          id?: string
          move_id: string
          qty?: number
          tenant_id: string
        }
        Update: {
          batch_id?: string
          id?: string
          move_id?: string
          qty?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_consumptions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_consumptions_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "stock_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_consumptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      boq_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          project_id: string
          qty: number
          tenant_id: string
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          project_id: string
          qty?: number
          tenant_id: string
          unit?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          project_id?: string
          qty?: number
          tenant_id?: string
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "boq_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          tenant_id: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          tenant_id: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          recipient_id: string | null
          sender_id: string
          tenant_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          recipient_id?: string | null
          sender_id: string
          tenant_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          recipient_id?: string | null
          sender_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cheques: {
        Row: {
          amount: number
          bank_id: string | null
          branch_id: string | null
          cheque_no: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: string
          due_date: string
          id: string
          issue_date: string
          notes: string | null
          partner_id: string | null
          posted_status: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          bank_id?: string | null
          branch_id?: string | null
          cheque_no: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          direction?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          partner_id?: string | null
          posted_status?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          bank_id?: string | null
          branch_id?: string | null
          cheque_no?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          direction?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          partner_id?: string | null
          posted_status?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cheques_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          account_id: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_group: boolean
          name: string
          name_en: string | null
          notes: string | null
          parent_id: string | null
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          name: string
          name_en?: string | null
          notes?: string | null
          parent_id?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          name?: string
          name_en?: string | null
          notes?: string | null
          parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          gain_account_id: string | null
          id: string
          is_active: boolean
          loss_account_id: string | null
          name: string
          symbol: string | null
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          gain_account_id?: string | null
          id?: string
          is_active?: boolean
          loss_account_id?: string | null
          name: string
          symbol?: string | null
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          gain_account_id?: string | null
          id?: string
          is_active?: boolean
          loss_account_id?: string | null
          name?: string
          symbol?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "currencies_gain_account_id_fkey"
            columns: ["gain_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currencies_loss_account_id_fkey"
            columns: ["loss_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      desktop_activation_codes: {
        Row: {
          batch: string | null
          code: string
          created_at: string
          created_by: string | null
          customer: string
          days: number
          id: string
          license_id: string | null
          plan: string
          revoked: boolean
          used_at: string | null
          used_device: string | null
        }
        Insert: {
          batch?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          customer: string
          days?: number
          id?: string
          license_id?: string | null
          plan?: string
          revoked?: boolean
          used_at?: string | null
          used_device?: string | null
        }
        Update: {
          batch?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer?: string
          days?: number
          id?: string
          license_id?: string | null
          plan?: string
          revoked?: boolean
          used_at?: string | null
          used_device?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "desktop_activation_codes_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "desktop_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      desktop_devices: {
        Row: {
          activated_at: string | null
          activation_code: string | null
          app_version: string | null
          company_name: string | null
          cpu: string | null
          customer: string | null
          device_id: string
          first_seen: string
          hostname: string | null
          last_ip: string | null
          last_seen: string
          license_id: string | null
          os_name: string | null
          platform: string | null
          ram_gb: number | null
          specs: Json | null
        }
        Insert: {
          activated_at?: string | null
          activation_code?: string | null
          app_version?: string | null
          company_name?: string | null
          cpu?: string | null
          customer?: string | null
          device_id: string
          first_seen?: string
          hostname?: string | null
          last_ip?: string | null
          last_seen?: string
          license_id?: string | null
          os_name?: string | null
          platform?: string | null
          ram_gb?: number | null
          specs?: Json | null
        }
        Update: {
          activated_at?: string | null
          activation_code?: string | null
          app_version?: string | null
          company_name?: string | null
          cpu?: string | null
          customer?: string | null
          device_id?: string
          first_seen?: string
          hostname?: string | null
          last_ip?: string | null
          last_seen?: string
          license_id?: string | null
          os_name?: string | null
          platform?: string | null
          ram_gb?: number | null
          specs?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "desktop_devices_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "desktop_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      desktop_licenses: {
        Row: {
          created_at: string
          created_by: string | null
          customer: string
          device_id: string
          expires_at: string | null
          id: string
          license_key: string
          notes: string | null
          plan: string
          revoked: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer: string
          device_id: string
          expires_at?: string | null
          id?: string
          license_key: string
          notes?: string | null
          plan?: string
          revoked?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer?: string
          device_id?: string
          expires_at?: string | null
          id?: string
          license_key?: string
          notes?: string | null
          plan?: string
          revoked?: boolean
        }
        Relationships: []
      }
      doc_patterns: {
        Row: {
          accounts: Json
          allowed_user_ids: string[]
          cash_account_ids: string[]
          created_at: string
          currency_codes: string[]
          defaults: Json
          doc_type: string
          entry_lines: Json
          explanation: string | null
          hidden: string[]
          id: string
          is_active: boolean
          locked: string[]
          name: string
          partner_account_ids: string[]
          partner_group_ids: string[]
          partner_ids: string[]
          tenant_id: string
          warehouse_ids: string[]
        }
        Insert: {
          accounts?: Json
          allowed_user_ids?: string[]
          cash_account_ids?: string[]
          created_at?: string
          currency_codes?: string[]
          defaults?: Json
          doc_type: string
          entry_lines?: Json
          explanation?: string | null
          hidden?: string[]
          id?: string
          is_active?: boolean
          locked?: string[]
          name: string
          partner_account_ids?: string[]
          partner_group_ids?: string[]
          partner_ids?: string[]
          tenant_id?: string
          warehouse_ids?: string[]
        }
        Update: {
          accounts?: Json
          allowed_user_ids?: string[]
          cash_account_ids?: string[]
          created_at?: string
          currency_codes?: string[]
          defaults?: Json
          doc_type?: string
          entry_lines?: Json
          explanation?: string | null
          hidden?: string[]
          id?: string
          is_active?: boolean
          locked?: string[]
          name?: string
          partner_account_ids?: string[]
          partner_group_ids?: string[]
          partner_ids?: string[]
          tenant_id?: string
          warehouse_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "doc_patterns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_lines: {
        Row: {
          account_id: string | null
          charge_accounts: Json
          created_at: string
          description: string | null
          document_id: string
          expiry_date: string | null
          id: string
          line_addition: number
          line_discount: number
          product_id: string | null
          qty: number
          tenant_id: string
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          account_id?: string | null
          charge_accounts?: Json
          created_at?: string
          description?: string | null
          document_id: string
          expiry_date?: string | null
          id?: string
          line_addition?: number
          line_discount?: number
          product_id?: string | null
          qty: number
          tenant_id: string
          unit_price?: number
          warehouse_id?: string | null
        }
        Update: {
          account_id?: string | null
          charge_accounts?: Json
          created_at?: string
          description?: string | null
          document_id?: string
          expiry_date?: string | null
          id?: string
          line_addition?: number
          line_discount?: number
          product_id?: string | null
          qty?: number
          tenant_id?: string
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_lines_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          account_id: string | null
          amount: number
          branch_id: string | null
          cash_account_id: string | null
          charges: Json
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          discount_amount: number
          doc_date: string
          doc_no: number | null
          doc_time: string | null
          doc_type: string
          exchange_rate: number
          final_warehouse_id: string | null
          freight_amount: number
          id: string
          journal_entry_id: string | null
          notes: string | null
          partner_account_id: string | null
          partner_id: string | null
          pattern_id: string | null
          pay_amount: number | null
          pay_currency: string | null
          payment_mode: string
          project_id: string | null
          received_at: string | null
          received_document_id: string | null
          settles_document_id: string | null
          status: string
          tenant_id: string
          terms: string | null
          to_warehouse_id: string | null
          valid_until: string | null
          warehouse_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          branch_id?: string | null
          cash_account_id?: string | null
          charges?: Json
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          discount_amount?: number
          doc_date?: string
          doc_no?: number | null
          doc_time?: string | null
          doc_type: string
          exchange_rate?: number
          final_warehouse_id?: string | null
          freight_amount?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          partner_account_id?: string | null
          partner_id?: string | null
          pattern_id?: string | null
          pay_amount?: number | null
          pay_currency?: string | null
          payment_mode?: string
          project_id?: string | null
          received_at?: string | null
          received_document_id?: string | null
          settles_document_id?: string | null
          status?: string
          tenant_id: string
          terms?: string | null
          to_warehouse_id?: string | null
          valid_until?: string | null
          warehouse_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          branch_id?: string | null
          cash_account_id?: string | null
          charges?: Json
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          discount_amount?: number
          doc_date?: string
          doc_no?: number | null
          doc_time?: string | null
          doc_type?: string
          exchange_rate?: number
          final_warehouse_id?: string | null
          freight_amount?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          partner_account_id?: string | null
          partner_id?: string | null
          pattern_id?: string | null
          pay_amount?: number | null
          pay_currency?: string | null
          payment_mode?: string
          project_id?: string | null
          received_at?: string | null
          received_document_id?: string | null
          settles_document_id?: string | null
          status?: string
          tenant_id?: string
          terms?: string | null
          to_warehouse_id?: string | null
          valid_until?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_final_warehouse_id_fkey"
            columns: ["final_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "doc_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_received_document_id_fkey"
            columns: ["received_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_settles_document_id_fkey"
            columns: ["settles_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_adjustments: {
        Row: {
          adj_date: string
          amount: number
          applied: boolean
          created_at: string
          employee_id: string
          id: string
          kind: string
          notes: string | null
          payroll_month: string | null
          tenant_id: string
        }
        Insert: {
          adj_date?: string
          amount?: number
          applied?: boolean
          created_at?: string
          employee_id: string
          id?: string
          kind?: string
          notes?: string | null
          payroll_month?: string | null
          tenant_id: string
        }
        Update: {
          adj_date?: string
          amount?: number
          applied?: boolean
          created_at?: string
          employee_id?: string
          id?: string
          kind?: string
          notes?: string | null
          payroll_month?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_advances: {
        Row: {
          adv_date: string
          amount: number
          created_at: string
          deducted: boolean
          employee_id: string
          id: string
          notes: string | null
          payroll_month: string | null
          tenant_id: string
        }
        Insert: {
          adv_date?: string
          amount?: number
          created_at?: string
          deducted?: boolean
          employee_id: string
          id?: string
          notes?: string | null
          payroll_month?: string | null
          tenant_id: string
        }
        Update: {
          adv_date?: string
          amount?: number
          created_at?: string
          deducted?: boolean
          employee_id?: string
          id?: string
          notes?: string | null
          payroll_month?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leaves: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          notes: string | null
          start_date: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type?: string
          notes?: string | null
          start_date: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_leaves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leaves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          account_id: string | null
          address: string | null
          allowances: number
          bank_account: string | null
          base_salary: number
          branch_id: string | null
          code: string | null
          created_at: string
          currency: string
          department: string | null
          email: string | null
          hire_date: string | null
          id: string
          is_active: boolean
          job_title: string | null
          name: string
          national_id: string | null
          notes: string | null
          phone: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          address?: string | null
          allowances?: number
          bank_account?: string | null
          base_salary?: number
          branch_id?: string | null
          code?: string | null
          created_at?: string
          currency?: string
          department?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          name: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          address?: string | null
          allowances?: number
          bank_account?: string | null
          base_salary?: number
          branch_id?: string | null
          code?: string | null
          created_at?: string
          currency?: string
          department?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          name?: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          rate_date: string
          rate_to_usd: number
          source: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          rate_date?: string
          rate_to_usd: number
          source?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          rate_date?: string
          rate_to_usd?: number
          source?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          account_id: string | null
          accum_dep_account_id: string | null
          branch_id: string | null
          code: string | null
          cost: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          dep_expense_account_id: string | null
          id: string
          last_dep_date: string | null
          name: string
          notes: string | null
          purchase_date: string
          salvage_value: number
          tenant_id: string
          useful_life_years: number
        }
        Insert: {
          account_id?: string | null
          accum_dep_account_id?: string | null
          branch_id?: string | null
          code?: string | null
          cost: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          dep_expense_account_id?: string | null
          id?: string
          last_dep_date?: string | null
          name: string
          notes?: string | null
          purchase_date?: string
          salvage_value?: number
          tenant_id: string
          useful_life_years?: number
        }
        Update: {
          account_id?: string | null
          accum_dep_account_id?: string | null
          branch_id?: string | null
          code?: string | null
          cost?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          dep_expense_account_id?: string | null
          id?: string
          last_dep_date?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string
          salvage_value?: number
          tenant_id?: string
          useful_life_years?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_accum_dep_account_id_fkey"
            columns: ["accum_dep_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_dep_expense_account_id_fkey"
            columns: ["dep_expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_log: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string | null
          details: Json
          entry_id: string | null
          id: string
          kind: string
          new_rate: number | null
          old_rate: number | null
          rate_date: string
          source: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          details?: Json
          entry_id?: string | null
          id?: string
          kind: string
          new_rate?: number | null
          old_rate?: number | null
          rate_date: string
          source?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          details?: Json
          entry_id?: string | null
          id?: string
          kind?: string
          new_rate?: number | null
          old_rate?: number | null
          rate_date?: string
          source?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_log_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_reservations: {
        Row: {
          advance_amount: number
          branch_id: string | null
          check_in: string
          check_out: string
          created_at: string
          created_by: string | null
          currency: string
          guest_name: string
          guest_phone: string | null
          id: string
          journal_entry_id: string | null
          nights: number
          notes: string | null
          rate: number
          room_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          advance_amount?: number
          branch_id?: string | null
          check_in: string
          check_out: string
          created_at?: string
          created_by?: string | null
          currency?: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          journal_entry_id?: string | null
          nights?: number
          notes?: string | null
          rate?: number
          room_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          advance_amount?: number
          branch_id?: string | null
          check_in?: string
          check_out?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          journal_entry_id?: string | null
          nights?: number
          notes?: string | null
          rate?: number
          room_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_rooms: {
        Row: {
          created_at: string
          floor: number | null
          id: string
          notes: string | null
          price_per_night: number
          room_no: string
          room_type: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          floor?: number | null
          id?: string
          notes?: string | null
          price_per_night?: number
          room_no: string
          room_type?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          floor?: number | null
          id?: string
          notes?: string | null
          price_per_night?: number
          room_no?: string
          room_type?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rooms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          audited: boolean
          audited_at: string | null
          audited_by: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          doc_type: string
          document_id: string | null
          entry_date: string
          entry_no: number
          exchange_rate: number
          id: string
          tenant_id: string
        }
        Insert: {
          audited?: boolean
          audited_at?: string | null
          audited_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          doc_type?: string
          document_id?: string | null
          entry_date?: string
          entry_no: number
          exchange_rate?: number
          id?: string
          tenant_id: string
        }
        Update: {
          audited?: boolean
          audited_at?: string | null
          audited_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          doc_type?: string
          document_id?: string | null
          entry_date?: string
          entry_no?: number
          exchange_rate?: number
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          branch_id: string | null
          cost_center_id: string | null
          credit: number
          debit: number
          description: string | null
          entry_id: string
          fc_amount: number | null
          id: string
          line_currency: string | null
          line_rate: number | null
          partner_id: string | null
          project_id: string | null
          source_document_id: string | null
          tenant_id: string
        }
        Insert: {
          account_id: string
          branch_id?: string | null
          cost_center_id?: string | null
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          fc_amount?: number | null
          id?: string
          line_currency?: string | null
          line_rate?: number | null
          partner_id?: string | null
          project_id?: string | null
          source_document_id?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string
          branch_id?: string | null
          cost_center_id?: string | null
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          fc_amount?: number | null
          id?: string
          line_currency?: string | null
          line_rate?: number | null
          partner_id?: string | null
          project_id?: string | null
          source_document_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          device: string | null
          device_id: string | null
          device_info: Json | null
          event: string
          id: string
          ip: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device?: string | null
          device_id?: string | null
          device_info?: Json | null
          event: string
          id?: string
          ip?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device?: string | null
          device_id?: string | null
          device_info?: Json | null
          event?: string
          id?: string
          ip?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      manufacturing_byproducts: {
        Row: {
          id: string
          order_id: string
          product_id: string
          qty: number
          tenant_id: string
          unit_value: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          qty?: number
          tenant_id?: string
          unit_value?: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          qty?: number
          tenant_id?: string
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_byproducts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_byproducts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturing_materials: {
        Row: {
          component_product_id: string
          id: string
          order_id: string
          qty: number
          tenant_id: string
          unit_cost: number
        }
        Insert: {
          component_product_id: string
          id?: string
          order_id: string
          qty?: number
          tenant_id: string
          unit_cost?: number
        }
        Update: {
          component_product_id?: string
          id?: string
          order_id?: string
          qty?: number
          tenant_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_materials_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_materials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_materials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturing_orders: {
        Row: {
          actual_total_cost: number | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          good_qty: number | null
          id: string
          journal_entry_id: string | null
          labor_cost: number
          mo_date: string
          mo_no: number | null
          notes: string | null
          overhead_account_id: string | null
          overhead_cost: number
          product_id: string
          qty: number
          scrap_pct: number
          stage: string
          standard_unit_cost: number
          status: string
          tenant_id: string
          warehouse_id: string
          wip_account_id: string | null
          wip_entry_id: string | null
        }
        Insert: {
          actual_total_cost?: number | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          good_qty?: number | null
          id?: string
          journal_entry_id?: string | null
          labor_cost?: number
          mo_date?: string
          mo_no?: number | null
          notes?: string | null
          overhead_account_id?: string | null
          overhead_cost?: number
          product_id: string
          qty?: number
          scrap_pct?: number
          stage?: string
          standard_unit_cost?: number
          status?: string
          tenant_id: string
          warehouse_id: string
          wip_account_id?: string | null
          wip_entry_id?: string | null
        }
        Update: {
          actual_total_cost?: number | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          good_qty?: number | null
          id?: string
          journal_entry_id?: string | null
          labor_cost?: number
          mo_date?: string
          mo_no?: number | null
          notes?: string | null
          overhead_account_id?: string | null
          overhead_cost?: number
          product_id?: string
          qty?: number
          scrap_pct?: number
          stage?: string
          standard_unit_cost?: number
          status?: string
          tenant_id?: string
          warehouse_id?: string
          wip_account_id?: string | null
          wip_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_overhead_account_id_fkey"
            columns: ["overhead_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_wip_account_id_fkey"
            columns: ["wip_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_wip_entry_id_fkey"
            columns: ["wip_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          created_at: string
          notification_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notification_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          notification_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          link: string | null
          tenant_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          link?: string | null
          tenant_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          link?: string | null
          tenant_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_finance_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          entry_date: string
          id: string
          kind: string
          notes: string | null
          title: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          entry_date?: string
          id?: string
          kind: string
          notes?: string | null
          title: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          entry_date?: string
          id?: string
          kind?: string
          notes?: string | null
          title?: string
        }
        Relationships: []
      }
      partner_inquiries: {
        Row: {
          author_name: string | null
          body: string
          created_at: string
          created_by: string | null
          from_partner: boolean
          id: string
          link_id: string
          tenant_id: string
        }
        Insert: {
          author_name?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          from_partner?: boolean
          id?: string
          link_id: string
          tenant_id: string
        }
        Update: {
          author_name?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          from_partner?: boolean
          id?: string
          link_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_inquiries_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          account_id: string | null
          address: string | null
          auto_account: boolean
          auto_parent_account_id: string | null
          barcode: string | null
          code: string | null
          created_at: string
          credit_limit: number
          currency: string | null
          deal_type: string
          id: string
          is_active: boolean
          is_group: boolean
          is_monetary: boolean
          name: string
          name_en: string | null
          parent_id: string | null
          partner_type: string
          phone: string | null
          price_level: number | null
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          address?: string | null
          auto_account?: boolean
          auto_parent_account_id?: string | null
          barcode?: string | null
          code?: string | null
          created_at?: string
          credit_limit?: number
          currency?: string | null
          deal_type?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          is_monetary?: boolean
          name: string
          name_en?: string | null
          parent_id?: string | null
          partner_type?: string
          phone?: string | null
          price_level?: number | null
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          address?: string | null
          auto_account?: boolean
          auto_parent_account_id?: string | null
          barcode?: string | null
          code?: string | null
          created_at?: string
          credit_limit?: number
          currency?: string | null
          deal_type?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          is_monetary?: boolean
          name?: string
          name_en?: string | null
          parent_id?: string | null
          partner_type?: string
          phone?: string | null
          price_level?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          branch_id: string | null
          created_at: string
          details: Json | null
          id: string
          journal_entry_id: string | null
          month: string
          tenant_id: string
          total_advances: number
          total_gross: number
          total_net: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          journal_entry_id?: string | null
          month: string
          tenant_id: string
          total_advances?: number
          total_gross?: number
          total_net?: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          journal_entry_id?: string | null
          month?: string
          tenant_id?: string
          total_advances?: number
          total_gross?: number
          total_net?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_notes: {
        Row: {
          assigned_to: string | null
          body: string
          color: string
          created_at: string
          done: boolean
          due_at: string | null
          id: string
          kind: string
          pinned: boolean
          priority: string
          remind_at: string | null
          repeat: string
          reply: string
          status: string
          tenant_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          body?: string
          color?: string
          created_at?: string
          done?: boolean
          due_at?: string | null
          id?: string
          kind?: string
          pinned?: boolean
          priority?: string
          remind_at?: string | null
          repeat?: string
          reply?: string
          status?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          assigned_to?: string | null
          body?: string
          color?: string
          created_at?: string
          done?: boolean
          due_at?: string | null
          id?: string
          kind?: string
          pinned?: boolean
          priority?: string
          remind_at?: string | null
          repeat?: string
          reply?: string
          status?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pos_shifts: {
        Row: {
          branch_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          opened_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stations: {
        Row: {
          allow_expenses: boolean
          allowed_user_ids: string[]
          branch_id: string | null
          cash_account_id: string | null
          cash_account_ids: string[]
          created_at: string
          default_partner_id: string | null
          expense_account_ids: string[]
          id: string
          is_active: boolean
          lock_partner: boolean
          lock_price_level: boolean
          lock_warehouse: boolean
          max_expense: number
          name: string
          partner_group_ids: string[]
          partner_ids: string[]
          pattern_id: string | null
          price_level: string | null
          station_type: string
          tenant_id: string
          warehouse_id: string | null
        }
        Insert: {
          allow_expenses?: boolean
          allowed_user_ids?: string[]
          branch_id?: string | null
          cash_account_id?: string | null
          cash_account_ids?: string[]
          created_at?: string
          default_partner_id?: string | null
          expense_account_ids?: string[]
          id?: string
          is_active?: boolean
          lock_partner?: boolean
          lock_price_level?: boolean
          lock_warehouse?: boolean
          max_expense?: number
          name: string
          partner_group_ids?: string[]
          partner_ids?: string[]
          pattern_id?: string | null
          price_level?: string | null
          station_type?: string
          tenant_id?: string
          warehouse_id?: string | null
        }
        Update: {
          allow_expenses?: boolean
          allowed_user_ids?: string[]
          branch_id?: string | null
          cash_account_id?: string | null
          cash_account_ids?: string[]
          created_at?: string
          default_partner_id?: string | null
          expense_account_ids?: string[]
          id?: string
          is_active?: boolean
          lock_partner?: boolean
          lock_price_level?: boolean
          lock_warehouse?: boolean
          max_expense?: number
          name?: string
          partner_group_ids?: string[]
          partner_ids?: string[]
          pattern_id?: string | null
          price_level?: string | null
          station_type?: string
          tenant_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stations_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stations_default_partner_id_fkey"
            columns: ["default_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stations_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "doc_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batches: {
        Row: {
          batch_no: string | null
          created_at: string
          document_id: string | null
          expiry_date: string | null
          id: string
          product_id: string
          qty_remaining: number
          tenant_id: string
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
          product_id: string
          qty_remaining?: number
          tenant_id: string
          unit_cost?: number
          warehouse_id: string
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
          product_id?: string
          qty_remaining?: number
          tenant_id?: string
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recipes: {
        Row: {
          component_product_id: string
          created_at: string
          id: string
          product_id: string
          qty: number
          tenant_id: string
        }
        Insert: {
          component_product_id: string
          created_at?: string
          id?: string
          product_id: string
          qty?: number
          tenant_id: string
        }
        Update: {
          component_product_id?: string
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_recipes_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          account_link_mode: string
          avg_cost: number
          barcode: string | null
          billing_period: string
          category: string | null
          cost_center_id: string | null
          cost_center_link_mode: string
          cost_center_parent_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          default_warehouse_id: string | null
          duration_hours: number
          id: string
          initial_quantity: number
          is_active: boolean
          is_group: boolean
          item_type: string
          last_purchase_price: number
          min_price: number
          name: string
          name_en: string | null
          parent_id: string | null
          price_rules: Json
          prices: Json
          purchase_price: number
          qty_on_hand: number
          reorder_level: number
          sale_price: number
          service_account_id: string | null
          service_account_parent_id: string | null
          service_expense_account_id: string | null
          service_source: string
          sku: string
          sla_hours: number
          standard_cost: number
          tenant_id: string
          unit: string
          warranty_days: number
        }
        Insert: {
          account_link_mode?: string
          avg_cost?: number
          barcode?: string | null
          billing_period?: string
          category?: string | null
          cost_center_id?: string | null
          cost_center_link_mode?: string
          cost_center_parent_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          default_warehouse_id?: string | null
          duration_hours?: number
          id?: string
          initial_quantity?: number
          is_active?: boolean
          is_group?: boolean
          item_type?: string
          last_purchase_price?: number
          min_price?: number
          name: string
          name_en?: string | null
          parent_id?: string | null
          price_rules?: Json
          prices?: Json
          purchase_price?: number
          qty_on_hand?: number
          reorder_level?: number
          sale_price?: number
          service_account_id?: string | null
          service_account_parent_id?: string | null
          service_expense_account_id?: string | null
          service_source?: string
          sku: string
          sla_hours?: number
          standard_cost?: number
          tenant_id: string
          unit?: string
          warranty_days?: number
        }
        Update: {
          account_link_mode?: string
          avg_cost?: number
          barcode?: string | null
          billing_period?: string
          category?: string | null
          cost_center_id?: string | null
          cost_center_link_mode?: string
          cost_center_parent_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          default_warehouse_id?: string | null
          duration_hours?: number
          id?: string
          initial_quantity?: number
          is_active?: boolean
          is_group?: boolean
          item_type?: string
          last_purchase_price?: number
          min_price?: number
          name?: string
          name_en?: string | null
          parent_id?: string | null
          price_rules?: Json
          prices?: Json
          purchase_price?: number
          qty_on_hand?: number
          reorder_level?: number
          sale_price?: number
          service_account_id?: string | null
          service_account_parent_id?: string | null
          service_expense_account_id?: string | null
          service_source?: string
          sku?: string
          sla_hours?: number
          standard_cost?: number
          tenant_id?: string
          unit?: string
          warranty_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_cost_center_parent_id_fkey"
            columns: ["cost_center_parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_service_account_id_fkey"
            columns: ["service_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_service_account_parent_id_fkey"
            columns: ["service_account_parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_service_expense_account_id_fkey"
            columns: ["service_expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_kind: string
          active_branch_id: string | null
          avatar_url: string | null
          branch_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_auditor: boolean
          is_super_admin: boolean
          is_tenant_admin: boolean
          must_change_password: boolean
          notif_seen_at: string
          phone: string | null
          tenant_id: string | null
        }
        Insert: {
          account_kind?: string
          active_branch_id?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          is_auditor?: boolean
          is_super_admin?: boolean
          is_tenant_admin?: boolean
          must_change_password?: boolean
          notif_seen_at?: string
          phone?: string | null
          tenant_id?: string | null
        }
        Update: {
          account_kind?: string
          active_branch_id?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_auditor?: boolean
          is_super_admin?: boolean
          is_tenant_admin?: boolean
          must_change_password?: boolean
          notif_seen_at?: string
          phone?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_branch_id_fkey"
            columns: ["active_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_bom: {
        Row: {
          category: string
          created_at: string
          id: string
          item: string
          notes: string | null
          product_id: string | null
          project_id: string
          qty: number
          spec: string | null
          supply_status: string
          tenant_id: string
          unit_cost: number
          waste_qty: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          item: string
          notes?: string | null
          product_id?: string | null
          project_id: string
          qty?: number
          spec?: string | null
          supply_status?: string
          tenant_id: string
          unit_cost?: number
          waste_qty?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          item?: string
          notes?: string | null
          product_id?: string | null
          project_id?: string
          qty?: number
          spec?: string | null
          supply_status?: string
          tenant_id?: string
          unit_cost?: number
          waste_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_bom_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bom_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bom_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_expenses: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          expense_date: string
          id: string
          project_id: string
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          expense_date?: string
          id?: string
          project_id: string
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          expense_date?: string
          id?: string
          project_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          invoiced: boolean
          is_done: boolean
          name: string
          project_id: string
          tenant_id: string
          trigger_pct: number | null
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoiced?: boolean
          is_done?: boolean
          name: string
          project_id: string
          tenant_id: string
          trigger_pct?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoiced?: boolean
          is_done?: boolean
          name?: string
          project_id?: string
          tenant_id?: string
          trigger_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quotes: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          payload: Json
          project_id: string
          quote_date: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          payload?: Json
          project_id: string
          quote_date?: string
          tenant_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          payload?: Json
          project_id?: string
          quote_date?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_snags: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          priority: string
          project_id: string
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          priority?: string
          project_id: string
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          priority?: string
          project_id?: string
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_snags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_snags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          tenant_id: string
          tree: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          tenant_id?: string
          tree?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          tree?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_wbs: {
        Row: {
          assignee: string | null
          created_at: string
          data: Json
          end_date: string | null
          id: string
          is_continuous: boolean
          is_final: boolean
          name: string
          parent_id: string | null
          progress: number
          project_id: string
          section: string
          sort_order: number
          start_date: string | null
          tenant_id: string
          weight: number
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          data?: Json
          end_date?: string | null
          id?: string
          is_continuous?: boolean
          is_final?: boolean
          name: string
          parent_id?: string | null
          progress?: number
          project_id: string
          section?: string
          sort_order?: number
          start_date?: string | null
          tenant_id: string
          weight?: number
        }
        Update: {
          assignee?: string | null
          created_at?: string
          data?: Json
          end_date?: string | null
          id?: string
          is_continuous?: boolean
          is_final?: boolean
          name?: string
          parent_id?: string | null
          progress?: number
          project_id?: string
          section?: string
          sort_order?: number
          start_date?: string | null
          tenant_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_wbs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_wbs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_wbs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_wbs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          account_id: string | null
          branch_id: string | null
          brand_color: string | null
          brand_logo_path: string | null
          client_id: string | null
          code: string | null
          completion_pct: number
          contract_value: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          end_date: string | null
          id: string
          is_active: boolean
          is_group: boolean
          lead_contact: string | null
          lead_phone: string | null
          lead_source: string | null
          name: string
          name_en: string | null
          notes: string | null
          parent_id: string | null
          start_date: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          branch_id?: string | null
          brand_color?: string | null
          brand_logo_path?: string | null
          client_id?: string | null
          code?: string | null
          completion_pct?: number
          contract_value?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          lead_contact?: string | null
          lead_phone?: string | null
          lead_source?: string | null
          name: string
          name_en?: string | null
          notes?: string | null
          parent_id?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          branch_id?: string | null
          brand_color?: string | null
          brand_logo_path?: string | null
          client_id?: string | null
          code?: string | null
          completion_pct?: number
          contract_value?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          lead_contact?: string | null
          lead_phone?: string | null
          lead_source?: string | null
          name?: string
          name_en?: string | null
          notes?: string | null
          parent_id?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      record_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          entity_id: string
          entity_label: string | null
          entity_type: string
          id: string
          kind: string
          mentions: string[]
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string
          entity_id: string
          entity_label?: string | null
          entity_type: string
          id?: string
          kind?: string
          mentions?: string[]
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_label?: string | null
          entity_type?: string
          id?: string
          kind?: string
          mentions?: string[]
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_entries: {
        Row: {
          amount: number
          approval_mode: string
          created_at: string
          credit_account_id: string
          currency: string
          debit_account_id: string
          description: string | null
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          name: string
          next_date: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          approval_mode?: string
          created_at?: string
          credit_account_id: string
          currency?: string
          debit_account_id: string
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          next_date?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          approval_mode?: string
          created_at?: string
          credit_account_id?: string
          currency?: string
          debit_account_id?: string
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          next_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_entries_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_entries_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restored_user_passwords: {
        Row: {
          created_at: string
          temp_password: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          temp_password: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          temp_password?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      service_contracts: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          last_document_id: string | null
          next_billing_date: string | null
          notes: string | null
          partner_id: string | null
          period: string
          price: number
          product_id: string | null
          quota: number
          start_date: string
          status: string
          tenant_id: string
          title: string
          used: number
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          last_document_id?: string | null
          next_billing_date?: string | null
          notes?: string | null
          partner_id?: string | null
          period?: string
          price?: number
          product_id?: string | null
          quota?: number
          start_date?: string
          status?: string
          tenant_id?: string
          title?: string
          used?: number
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          last_document_id?: string | null
          next_billing_date?: string | null
          notes?: string | null
          partner_id?: string | null
          period?: string
          price?: number
          product_id?: string | null
          quota?: number
          start_date?: string
          status?: string
          tenant_id?: string
          title?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_contracts_last_document_id_fkey"
            columns: ["last_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          actual_hours: number
          commission_pct: number
          completed_at: string | null
          contract_id: string | null
          created_at: string
          document_id: string | null
          due_date: string | null
          employee_id: string | null
          est_hours: number
          id: string
          notes: string | null
          partner_id: string | null
          product_id: string | null
          project_id: string | null
          sla_due_at: string | null
          status: string
          tenant_id: string
          warranty_until: string | null
        }
        Insert: {
          actual_hours?: number
          commission_pct?: number
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          document_id?: string | null
          due_date?: string | null
          employee_id?: string | null
          est_hours?: number
          id?: string
          notes?: string | null
          partner_id?: string | null
          product_id?: string | null
          project_id?: string | null
          sla_due_at?: string | null
          status?: string
          tenant_id?: string
          warranty_until?: string | null
        }
        Update: {
          actual_hours?: number
          commission_pct?: number
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          document_id?: string | null
          due_date?: string | null
          employee_id?: string | null
          est_hours?: number
          id?: string
          notes?: string | null
          partner_id?: string | null
          product_id?: string | null
          project_id?: string | null
          sla_due_at?: string | null
          status?: string
          tenant_id?: string
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          expires_at: string
          id: string
          label: string | null
          password_hash: string | null
          password_salt: string | null
          revoked: boolean
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          entity_id: string
          entity_type: string
          expires_at?: string
          id?: string
          label?: string | null
          password_hash?: string | null
          password_salt?: string | null
          revoked?: boolean
          tenant_id?: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          expires_at?: string
          id?: string
          label?: string | null
          password_hash?: string | null
          password_salt?: string | null
          revoked?: boolean
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_drafts: {
        Row: {
          created_by: string
          data: Json
          draft_key: string
          id: string
          kind: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_by?: string
          data?: Json
          draft_key: string
          id?: string
          kind: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_by?: string
          data?: Json
          draft_key?: string
          id?: string
          kind?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      solar_ai_access: {
        Row: {
          blocked: boolean
          reason: string
          status: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          blocked?: boolean
          reason?: string
          status?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          blocked?: boolean
          reason?: string
          status?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      solar_fault_analyses: {
        Row: {
          analysis: string
          cache_key: string
          created_at: string
          tenant_id: string
        }
        Insert: {
          analysis: string
          cache_key: string
          created_at?: string
          tenant_id: string
        }
        Update: {
          analysis?: string
          cache_key?: string
          created_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      solar_fleet_stations: {
        Row: {
          account_id: string
          capacity_kwp: number
          id: string
          imported_at: string
          name: string
          plant_id: string
          plant_kind: string | null
          provider: string
          tenant_id: string
        }
        Insert: {
          account_id: string
          capacity_kwp?: number
          id?: string
          imported_at?: string
          name: string
          plant_id: string
          plant_kind?: string | null
          provider: string
          tenant_id: string
        }
        Update: {
          account_id?: string
          capacity_kwp?: number
          id?: string
          imported_at?: string
          name?: string
          plant_id?: string
          plant_kind?: string | null
          provider?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_fleet_stations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "solar_provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_fleet_stations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_monitoring: {
        Row: {
          capacity_kwp: number
          cleaning_days: number
          created_at: string
          demo: boolean
          extra_units: Json
          fleet_station_id: string | null
          inverter_sn: string | null
          last_cleaned: string | null
          last_data: Json | null
          last_sync: string | null
          peak_sun_hours: number
          plant_id: string | null
          project_id: string
          provider: string
          system_cost: number
          tariff: number
          tenant_id: string
          tickets: Json
          updated_at: string
        }
        Insert: {
          capacity_kwp?: number
          cleaning_days?: number
          created_at?: string
          demo?: boolean
          extra_units?: Json
          fleet_station_id?: string | null
          inverter_sn?: string | null
          last_cleaned?: string | null
          last_data?: Json | null
          last_sync?: string | null
          peak_sun_hours?: number
          plant_id?: string | null
          project_id: string
          provider?: string
          system_cost?: number
          tariff?: number
          tenant_id: string
          tickets?: Json
          updated_at?: string
        }
        Update: {
          capacity_kwp?: number
          cleaning_days?: number
          created_at?: string
          demo?: boolean
          extra_units?: Json
          fleet_station_id?: string | null
          inverter_sn?: string | null
          last_cleaned?: string | null
          last_data?: Json | null
          last_sync?: string | null
          peak_sun_hours?: number
          plant_id?: string | null
          project_id?: string
          provider?: string
          system_cost?: number
          tariff?: number
          tenant_id?: string
          tickets?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_monitoring_fleet_station_id_fkey"
            columns: ["fleet_station_id"]
            isOneToOne: false
            referencedRelation: "solar_fleet_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_monitoring_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_performance_flags: {
        Row: {
          created_at: string
          day: string
          id: string
          project_id: string
          ratio: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          project_id: string
          ratio: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          project_id?: string
          ratio?: number
          tenant_id?: string
        }
        Relationships: []
      }
      solar_projects: {
        Row: {
          approval_status: string
          created_at: string
          finance: Json
          permits: Json
          project_id: string
          survey: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          created_at?: string
          finance?: Json
          permits?: Json
          project_id: string
          survey?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          created_at?: string
          finance?: Json
          permits?: Json
          project_id?: string
          survey?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_provider_accounts: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          provider: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          provider: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          provider?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_provider_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_readings: {
        Row: {
          created_at: string
          data: Json
          id: string
          project_id: string
          read_at: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          project_id: string
          read_at: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          project_id?: string
          read_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_readings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_roles: {
        Row: {
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_moves: {
        Row: {
          branch_id: string | null
          created_at: string
          direction: string
          document_id: string | null
          id: string
          move_date: string
          partner_id: string | null
          product_id: string
          project_id: string | null
          qty: number
          reference: string | null
          tenant_id: string
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          direction: string
          document_id?: string | null
          id?: string
          move_date?: string
          partner_id?: string | null
          product_id: string
          project_id?: string | null
          qty: number
          reference?: string | null
          tenant_id: string
          unit_cost?: number
          warehouse_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          direction?: string
          document_id?: string | null
          id?: string
          move_date?: string
          partner_id?: string | null
          product_id?: string
          project_id?: string | null
          qty?: number
          reference?: string | null
          tenant_id?: string
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_moves_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          notes: string | null
          plan: string
          start_date: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          notes?: string | null
          plan: string
          start_date: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          plan?: string
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_staff: boolean
          sender_id: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_staff?: boolean
          sender_id?: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_staff?: boolean
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          created_by: string
          id: string
          status: string
          subject: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          status?: string
          subject: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          status?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_branding: {
        Row: {
          id: boolean
          logo_url: string | null
          mark_url: string | null
          system_name: string | null
          system_name_en: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          logo_url?: string | null
          mark_url?: string | null
          system_name?: string | null
          system_name_en?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          logo_url?: string | null
          mark_url?: string | null
          system_name?: string | null
          system_name_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      telegram_client_links: {
        Row: {
          active: boolean
          alerts_enabled: boolean
          chat_id: number | null
          created_at: string
          display_name: string | null
          failed_attempts: number
          id: string
          last_alert_key: string | null
          linked_at: string | null
          password_hash: string | null
          password_salt: string | null
          pending_chat_id: number | null
          project_id: string
          telegram_user_id: number | null
          tenant_id: string
          token: string
        }
        Insert: {
          active?: boolean
          alerts_enabled?: boolean
          chat_id?: number | null
          created_at?: string
          display_name?: string | null
          failed_attempts?: number
          id?: string
          last_alert_key?: string | null
          linked_at?: string | null
          password_hash?: string | null
          password_salt?: string | null
          pending_chat_id?: number | null
          project_id: string
          telegram_user_id?: number | null
          tenant_id: string
          token: string
        }
        Update: {
          active?: boolean
          alerts_enabled?: boolean
          chat_id?: number | null
          created_at?: string
          display_name?: string | null
          failed_attempts?: number
          id?: string
          last_alert_key?: string | null
          linked_at?: string | null
          password_hash?: string | null
          password_salt?: string | null
          pending_chat_id?: number | null
          project_id?: string
          telegram_user_id?: number | null
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_client_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_client_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_deliveries: {
        Row: {
          created_at: string
          delivery_key: string
          id: string
          member_id: string
          state: string
        }
        Insert: {
          created_at?: string
          delivery_key: string
          id?: string
          member_id: string
          state?: string
        }
        Update: {
          created_at?: string
          delivery_key?: string
          id?: string
          member_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_deliveries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "telegram_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_join_sessions: {
        Row: {
          attempts: number
          chat_id: number
          expires_at: string
          step: string
          team_id: string
          telegram_user_id: number
        }
        Insert: {
          attempts?: number
          chat_id: number
          expires_at?: string
          step: string
          team_id: string
          telegram_user_id: number
        }
        Update: {
          attempts?: number
          chat_id?: number
          expires_at?: string
          step?: string
          team_id?: string
          telegram_user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_join_sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "telegram_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_links: {
        Row: {
          chat_id: number | null
          code_expires: string | null
          created_at: string
          link_code: string | null
          linked_at: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          chat_id?: number | null
          code_expires?: string | null
          created_at?: string
          link_code?: string | null
          linked_at?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          chat_id?: number | null
          code_expires?: string | null
          created_at?: string
          link_code?: string | null
          linked_at?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_member_events: {
        Row: {
          created_at: string
          event: string
          id: string
          member_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          member_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          member_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_member_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "telegram_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_member_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_team_members: {
        Row: {
          active: boolean
          blocked: boolean
          chat_id: number
          display_name: string
          id: string
          joined_at: string
          last_seen_at: string | null
          logged_out_at: string | null
          preferences: Json
          reports_enabled: boolean
          system_user_id: string | null
          team_id: string
          telegram_user_id: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          blocked?: boolean
          chat_id: number
          display_name?: string
          id?: string
          joined_at?: string
          last_seen_at?: string | null
          logged_out_at?: string | null
          preferences?: Json
          reports_enabled?: boolean
          system_user_id?: string | null
          team_id: string
          telegram_user_id: number
          tenant_id: string
        }
        Update: {
          active?: boolean
          blocked?: boolean
          chat_id?: number
          display_name?: string
          id?: string
          joined_at?: string
          last_seen_at?: string | null
          logged_out_at?: string | null
          preferences?: Json
          reports_enabled?: boolean
          system_user_id?: string | null
          team_id?: string
          telegram_user_id?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "telegram_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_team_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_team_projects: {
        Row: {
          project_id: string
          team_id: string
          tenant_id: string
        }
        Insert: {
          project_id: string
          team_id: string
          tenant_id: string
        }
        Update: {
          project_id?: string
          team_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_team_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_team_projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "telegram_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_team_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_teams: {
        Row: {
          alerts_enabled: boolean
          created_at: string
          daily_enabled: boolean
          enabled: boolean
          id: string
          password_hash: string
          password_salt: string
          report_hour: number
          report_templates: Json
          tenant_id: string
        }
        Insert: {
          alerts_enabled?: boolean
          created_at?: string
          daily_enabled?: boolean
          enabled?: boolean
          id?: string
          password_hash: string
          password_salt: string
          report_hour?: number
          report_templates?: Json
          tenant_id: string
        }
        Update: {
          alerts_enabled?: boolean
          created_at?: string
          daily_enabled?: boolean
          enabled?: boolean
          id?: string
          password_hash?: string
          password_salt?: string
          report_hour?: number
          report_templates?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_updates: {
        Row: {
          created_at: string
          state: string
          update_id: number
        }
        Insert: {
          created_at?: string
          state?: string
          update_id: number
        }
        Update: {
          created_at?: string
          state?: string
          update_id?: number
        }
        Relationships: []
      }
      tenant_features: {
        Row: {
          enabled: boolean
          id: string
          module: string
          tenant_id: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          module: string
          tenant_id: string
        }
        Update: {
          enabled?: boolean
          id?: string
          module?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          config: Json
          id: string
          provider: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          id?: string
          provider: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: string
          provider?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          account_kind: string
          created_at: string
          is_auditor: boolean
          is_tenant_admin: boolean
          tenant_id: string
          user_id: string
        }
        Insert: {
          account_kind?: string
          created_at?: string
          is_auditor?: boolean
          is_tenant_admin?: boolean
          tenant_id: string
          user_id: string
        }
        Update: {
          account_kind?: string
          created_at?: string
          is_auditor?: boolean
          is_tenant_admin?: boolean
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          pay_date: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          pay_date?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          pay_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          account_code_len: number
          accum_dep_account_id: string | null
          advances_account_id: string | null
          auto_backup: boolean
          backup_every_days: number
          base_currency: string
          bound_device_at: string | null
          bound_device_id: string | null
          bound_device_info: Json | null
          business_activity: string | null
          business_sector: string | null
          capital_account_id: string | null
          cash_account_id: string | null
          closed_until: string | null
          closing_account_links: Json
          cogs_account_id: string | null
          cost_method: string
          customers_account_id: string | null
          dep_expense_account_id: string | null
          doc_type_accounts: Json
          entity_account_roots: Json
          fiscal_end: string | null
          fiscal_start: string | null
          fx_account_id: string | null
          fx_gain_account_id: string | null
          fx_loss_account_id: string | null
          fx_reval_last: string | null
          fx_reval_mode: string
          has_branches: boolean
          inventory_account_id: string | null
          inventory_adjust_account_id: string | null
          inventory_method: string
          last_backup_at: string | null
          letterhead: Json
          logo_url: string | null
          manual_datetime: boolean
          notes_payable_account_id: string | null
          notes_receivable_account_id: string | null
          onboarding_done: boolean
          operating_mode: string
          pattern_notes: Json
          period_type: string
          price_names: Json
          primary_color: string | null
          primary_pattern_denied: Json
          print_footer: string | null
          print_template: string
          product_code_len: number
          project_cost_account_id: string | null
          purchase_cost_policy: string
          purchase_discount_account_id: string | null
          purchase_freight_account_id: string | null
          purchases_account_id: string | null
          receipt_template: Json
          retained_earnings_account_id: string | null
          salaries_account_id: string | null
          sales_account_id: string | null
          sales_discount_account_id: string | null
          sales_freight_account_id: string | null
          service_price_names: Json
          standard_coding: boolean
          stock_shortage_account_id: string | null
          stock_surplus_account_id: string | null
          suppliers_account_id: string | null
          tax_number: string | null
          tax_settings: Json
          tenant_id: string
          theme_colors: Json
          updated_at: string
          warehouse_code_len: number
          white_label: boolean
        }
        Insert: {
          account_code_len?: number
          accum_dep_account_id?: string | null
          advances_account_id?: string | null
          auto_backup?: boolean
          backup_every_days?: number
          base_currency?: string
          bound_device_at?: string | null
          bound_device_id?: string | null
          bound_device_info?: Json | null
          business_activity?: string | null
          business_sector?: string | null
          capital_account_id?: string | null
          cash_account_id?: string | null
          closed_until?: string | null
          closing_account_links?: Json
          cogs_account_id?: string | null
          cost_method?: string
          customers_account_id?: string | null
          dep_expense_account_id?: string | null
          doc_type_accounts?: Json
          entity_account_roots?: Json
          fiscal_end?: string | null
          fiscal_start?: string | null
          fx_account_id?: string | null
          fx_gain_account_id?: string | null
          fx_loss_account_id?: string | null
          fx_reval_last?: string | null
          fx_reval_mode?: string
          has_branches?: boolean
          inventory_account_id?: string | null
          inventory_adjust_account_id?: string | null
          inventory_method?: string
          last_backup_at?: string | null
          letterhead?: Json
          logo_url?: string | null
          manual_datetime?: boolean
          notes_payable_account_id?: string | null
          notes_receivable_account_id?: string | null
          onboarding_done?: boolean
          operating_mode?: string
          pattern_notes?: Json
          period_type?: string
          price_names?: Json
          primary_color?: string | null
          primary_pattern_denied?: Json
          print_footer?: string | null
          print_template?: string
          product_code_len?: number
          project_cost_account_id?: string | null
          purchase_cost_policy?: string
          purchase_discount_account_id?: string | null
          purchase_freight_account_id?: string | null
          purchases_account_id?: string | null
          receipt_template?: Json
          retained_earnings_account_id?: string | null
          salaries_account_id?: string | null
          sales_account_id?: string | null
          sales_discount_account_id?: string | null
          sales_freight_account_id?: string | null
          service_price_names?: Json
          standard_coding?: boolean
          stock_shortage_account_id?: string | null
          stock_surplus_account_id?: string | null
          suppliers_account_id?: string | null
          tax_number?: string | null
          tax_settings?: Json
          tenant_id: string
          theme_colors?: Json
          updated_at?: string
          warehouse_code_len?: number
          white_label?: boolean
        }
        Update: {
          account_code_len?: number
          accum_dep_account_id?: string | null
          advances_account_id?: string | null
          auto_backup?: boolean
          backup_every_days?: number
          base_currency?: string
          bound_device_at?: string | null
          bound_device_id?: string | null
          bound_device_info?: Json | null
          business_activity?: string | null
          business_sector?: string | null
          capital_account_id?: string | null
          cash_account_id?: string | null
          closed_until?: string | null
          closing_account_links?: Json
          cogs_account_id?: string | null
          cost_method?: string
          customers_account_id?: string | null
          dep_expense_account_id?: string | null
          doc_type_accounts?: Json
          entity_account_roots?: Json
          fiscal_end?: string | null
          fiscal_start?: string | null
          fx_account_id?: string | null
          fx_gain_account_id?: string | null
          fx_loss_account_id?: string | null
          fx_reval_last?: string | null
          fx_reval_mode?: string
          has_branches?: boolean
          inventory_account_id?: string | null
          inventory_adjust_account_id?: string | null
          inventory_method?: string
          last_backup_at?: string | null
          letterhead?: Json
          logo_url?: string | null
          manual_datetime?: boolean
          notes_payable_account_id?: string | null
          notes_receivable_account_id?: string | null
          onboarding_done?: boolean
          operating_mode?: string
          pattern_notes?: Json
          period_type?: string
          price_names?: Json
          primary_color?: string | null
          primary_pattern_denied?: Json
          print_footer?: string | null
          print_template?: string
          product_code_len?: number
          project_cost_account_id?: string | null
          purchase_cost_policy?: string
          purchase_discount_account_id?: string | null
          purchase_freight_account_id?: string | null
          purchases_account_id?: string | null
          receipt_template?: Json
          retained_earnings_account_id?: string | null
          salaries_account_id?: string | null
          sales_account_id?: string | null
          sales_discount_account_id?: string | null
          sales_freight_account_id?: string | null
          service_price_names?: Json
          standard_coding?: boolean
          stock_shortage_account_id?: string | null
          stock_surplus_account_id?: string | null
          suppliers_account_id?: string | null
          tax_number?: string | null
          tax_settings?: Json
          tenant_id?: string
          theme_colors?: Json
          updated_at?: string
          warehouse_code_len?: number
          white_label?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_accum_dep_account_id_fkey"
            columns: ["accum_dep_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_advances_account_id_fkey"
            columns: ["advances_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_capital_account_id_fkey"
            columns: ["capital_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_cogs_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_customers_account_id_fkey"
            columns: ["customers_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_dep_expense_account_id_fkey"
            columns: ["dep_expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_fx_account_id_fkey"
            columns: ["fx_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_fx_gain_account_id_fkey"
            columns: ["fx_gain_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_fx_loss_account_id_fkey"
            columns: ["fx_loss_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_inventory_adjust_account_id_fkey"
            columns: ["inventory_adjust_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_notes_payable_account_id_fkey"
            columns: ["notes_payable_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_notes_receivable_account_id_fkey"
            columns: ["notes_receivable_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_project_cost_account_id_fkey"
            columns: ["project_cost_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_purchase_discount_account_id_fkey"
            columns: ["purchase_discount_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_purchase_freight_account_id_fkey"
            columns: ["purchase_freight_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_purchases_account_id_fkey"
            columns: ["purchases_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_retained_earnings_account_id_fkey"
            columns: ["retained_earnings_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_salaries_account_id_fkey"
            columns: ["salaries_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_sales_account_id_fkey"
            columns: ["sales_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_sales_discount_account_id_fkey"
            columns: ["sales_discount_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_sales_freight_account_id_fkey"
            columns: ["sales_freight_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_stock_shortage_account_id_fkey"
            columns: ["stock_shortage_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_stock_surplus_account_id_fkey"
            columns: ["stock_surplus_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_suppliers_account_id_fkey"
            columns: ["suppliers_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          fiscal_label: string | null
          id: string
          is_active: boolean
          max_users: number
          name: string
          name_en: string | null
          notes: string | null
          phone: string | null
          plan: string
          source_tenant_id: string | null
          sub_end: string
          sub_start: string
          subscription_fee: number
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          fiscal_label?: string | null
          id?: string
          is_active?: boolean
          max_users?: number
          name: string
          name_en?: string | null
          notes?: string | null
          phone?: string | null
          plan?: string
          source_tenant_id?: string | null
          sub_end?: string
          sub_start?: string
          subscription_fee?: number
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          fiscal_label?: string | null
          id?: string
          is_active?: boolean
          max_users?: number
          name?: string
          name_en?: string | null
          notes?: string | null
          phone?: string | null
          plan?: string
          source_tenant_id?: string | null
          sub_end?: string
          sub_start?: string
          subscription_fee?: number
        }
        Relationships: []
      }
      units: {
        Row: {
          base_unit: string | null
          created_at: string
          factor: number
          id: string
          kind: string
          name: string
          tenant_id: string
        }
        Insert: {
          base_unit?: string | null
          created_at?: string
          factor?: number
          id?: string
          kind?: string
          name: string
          tenant_id: string
        }
        Update: {
          base_unit?: string | null
          created_at?: string
          factor?: number
          id?: string
          kind?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cash_drawers: {
        Row: {
          account_id: string
          created_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cash_drawers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cash_drawers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cash_drawers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          id: string
          module: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module: string
          tenant_id: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prefs: {
        Row: {
          dashboard: Json | null
          extra: Json
          notif: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          dashboard?: Json | null
          extra?: Json
          notif?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          dashboard?: Json | null
          extra?: Json
          notif?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          account_id: string | null
          allow_negative: boolean
          branch_id: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_group: boolean
          location: string | null
          name: string
          name_en: string | null
          parent_id: string | null
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          allow_negative?: boolean
          branch_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          location?: string | null
          name: string
          name_en?: string | null
          parent_id?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          allow_negative?: boolean
          branch_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          location?: string | null
          name?: string
          name_en?: string | null
          parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _fill_defaults: { Args: { _row: Json; _t: string }; Returns: Json }
      _remap_row: {
        Args: { _defer: string[]; _t: string; j: Json }
        Returns: Json
      }
      _restore_guard: { Args: { _id: string }; Returns: undefined }
      _restore_remap: { Args: { _data: Json }; Returns: Json }
      _restore_remap_val: { Args: { v: Json }; Returns: Json }
      add_currency: {
        Args: { _code: string; _name: string; _symbol: string }
        Returns: undefined
      }
      attach_module: { Args: { _t: string }; Returns: string }
      can_see_branch: { Args: { _b: string }; Returns: boolean }
      claim_operating_device: { Args: { _device: string }; Returns: boolean }
      claim_super_admin: { Args: never; Returns: boolean }
      clear_must_change_password: { Args: never; Returns: undefined }
      clear_tenant_data: { Args: { _id: string }; Returns: undefined }
      clone_tenant: {
        Args: { _label: string; _name: string; _opts: Json }
        Returns: string
      }
      close_fiscal_year: { Args: never; Returns: undefined }
      close_pos_shift:
        | { Args: { _amount: number }; Returns: string }
        | { Args: { _amount: number; _at?: string }; Returns: string }
      company_backup_plan: { Args: never; Returns: Json }
      complete_mo: { Args: { _id: string }; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      decide_approval: {
        Args: { _approve: boolean; _id: string; _note: string }
        Returns: undefined
      }
      emit_notification:
        | {
            Args: {
              _body: string
              _kind: string
              _tenant: string
              _title: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _body: string
              _kind: string
              _link: string
              _tenant: string
              _title: string
            }
            Returns: undefined
          }
      enable_branches: { Args: { _on: boolean }; Returns: string }
      ensure_entity_parent_account: {
        Args: { _id: string; _seen?: string[]; _table: string; _tenant: string }
        Returns: string
      }
      ensure_opening_entry: {
        Args: { _branch: string; _date: string; _tenant: string }
        Returns: string
      }
      ensure_pos_drawer: { Args: { _user: string }; Returns: string }
      entity_ledger_account: {
        Args: {
          _currency: string
          _group: boolean
          _kind: string
          _name: string
          _parent: string
          _tenant: string
        }
        Returns: string
      }
      finalize_stocktake: {
        Args: { _entries: string[]; _id: string }
        Returns: undefined
      }
      fiscal_close_preview: {
        Args: never
        Returns: {
          account_id: string
          balance: number
          code: string
          kind: string
          name: string
        }[]
      }
      has_perm: {
        Args: {
          _action: Database["public"]["Enums"]["perm_action"]
          _module: string
        }
        Returns: boolean
      }
      hotel_check_in: { Args: { _id: string }; Returns: undefined }
      hotel_check_out: { Args: { _id: string }; Returns: string }
      hotel_receive_advance: {
        Args: { _amount: number; _id: string }
        Returns: string
      }
      is_auditor: { Args: never; Returns: boolean }
      is_auditor_or_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
      mark_notifications_seen: { Args: never; Returns: undefined }
      mo_material_cost: { Args: { _id: string }; Returns: number }
      my_branch_scope: { Args: never; Returns: string }
      my_data_files: {
        Args: never
        Returns: {
          fiscal_label: string
          id: string
          is_current: boolean
          name: string
        }[]
      }
      my_pos_cash: {
        Args: never
        Returns: {
          account_id: string
          balance: number
          main_account_id: string
        }[]
      }
      my_tenant_id: { Args: never; Returns: string }
      notify_note_reminder: { Args: { _id: string }; Returns: undefined }
      notify_super_admins: {
        Args: {
          _body: string
          _kind: string
          _link: string
          _tenant: string
          _title: string
        }
        Returns: undefined
      }
      notify_tenant_admins: {
        Args: {
          _body: string
          _kind: string
          _link: string
          _tenant: string
          _title: string
        }
        Returns: undefined
      }
      notify_user: {
        Args: {
          _body: string
          _kind: string
          _link: string
          _tenant: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      open_pos_shift: { Args: { _at?: string }; Returns: string }
      post_assembly: {
        Args: {
          _components: Json
          _date: string
          _mode: string
          _notes: string
          _product: string
          _qty: number
          _to_warehouse: string
          _warehouse: string
        }
        Returns: string
      }
      post_cost_document: { Args: { _id: string }; Returns: string }
      post_doc_charges: {
        Args: {
          _add_acc: string
          _ch: Json
          _disc_acc: string
          _e: string
          _sale: boolean
          _t: string
        }
        Returns: undefined
      }
      post_document: { Args: { _id: string }; Returns: string }
      post_document_core: { Args: { _id: string }; Returns: string }
      project_section_ok: {
        Args: {
          _action: Database["public"]["Enums"]["perm_action"]
          _section: string
        }
        Returns: boolean
      }
      purge_tenant: { Args: { _id: string }; Returns: undefined }
      recalc_wbs_progress: { Args: { _project: string }; Returns: number }
      receive_transfer: { Args: { _id: string }; Returns: string }
      redeem_desktop_activation: {
        Args: {
          _code: string
          _device: string
          _expires: string
          _id: string
          _key: string
        }
        Returns: Json
      }
      reopen_fiscal_period: { Args: never; Returns: undefined }
      restore_company_begin: { Args: { _id: string }; Returns: Json }
      restore_company_finish: {
        Args: { _id: string; _settings: Json; _tenant: Json }
        Returns: Json
      }
      restore_company_rows: {
        Args: { _id: string; _phase?: string; _rows: Json; _table: string }
        Returns: Json
      }
      restore_tenant: { Args: { _data: Json; _id: string }; Returns: undefined }
      restore_tenant_full: { Args: { _data: Json; _id: string }; Returns: Json }
      revalue_fx_balances: {
        Args: { _date: string; _post?: boolean; _rates: Json }
        Returns: {
          account_id: string
          booked_base: number
          code: string
          currency: string
          diff: number
          entry_id: string
          foreign_balance: number
          name: string
          revalued_base: number
        }[]
      }
      save_opening_entry: {
        Args: { _date: string; _lines: Json }
        Returns: string
      }
      set_active_branch: { Args: { _b: string }; Returns: undefined }
      set_bound_device_info: {
        Args: { _device: string; _info: Json }
        Returns: boolean
      }
      set_entry_audited: {
        Args: { _id: string; _ok: boolean }
        Returns: undefined
      }
      set_mo_stage: { Args: { _id: string; _stage: string }; Returns: string }
      set_operating_mode: {
        Args: { _device: string; _mode: string }
        Returns: undefined
      }
      set_tenant_branding: {
        Args: { _color: string; _logo: string }
        Returns: undefined
      }
      set_tenant_theme: {
        Args: { _colors: Json; _logo: string }
        Returns: undefined
      }
      set_tenant_white_label: { Args: { _on: boolean }; Returns: undefined }
      switch_tenant: { Args: { _t: string }; Returns: undefined }
      tenant_active: { Args: never; Returns: boolean }
      tenant_colleagues: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      undo_audit: { Args: { _id: number }; Returns: undefined }
      unpost_document: { Args: { _id: string }; Returns: undefined }
      update_company_info: {
        Args: {
          _address: string
          _code: string
          _name: string
          _notes: string
          _phone: string
        }
        Returns: undefined
      }
      update_my_profile: {
        Args: { _avatar_url: string; _full_name: string; _phone: string }
        Returns: undefined
      }
    }
    Enums: {
      account_nature:
        | "closing"
        | "balance_sheet"
        | "profit_loss"
        | "assets"
        | "liabilities"
        | "equity"
        | "revenues"
        | "expenses"
        | "cost_centers"
      currency_code:
        | "USD"
        | "SYP"
        | "TRY"
        | "EUR"
        | "SAR"
        | "AED"
        | "JOD"
        | "GBP"
        | "EGP"
        | "LIR"
        | "ZZZ"
      perm_action: "view" | "create" | "edit" | "delete"
      probe_xyz: "a"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_nature: [
        "closing",
        "balance_sheet",
        "profit_loss",
        "assets",
        "liabilities",
        "equity",
        "revenues",
        "expenses",
        "cost_centers",
      ],
      currency_code: [
        "USD",
        "SYP",
        "TRY",
        "EUR",
        "SAR",
        "AED",
        "JOD",
        "GBP",
        "EGP",
        "LIR",
        "ZZZ",
      ],
      perm_action: ["view", "create", "edit", "delete"],
      probe_xyz: ["a"],
    },
  },
} as const
