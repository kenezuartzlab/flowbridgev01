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
      app_admins: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      banner_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          slide_id: string
          surface: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          slide_id: string
          surface: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          slide_id?: string
          surface?: string
        }
        Relationships: []
      }
      campaign_completion_activities: {
        Row: {
          activity_id: string
          campaign_id: string
          completion_id: string
          created_at: string
          task_id: string
          user_wallet: string
        }
        Insert: {
          activity_id: string
          campaign_id: string
          completion_id: string
          created_at?: string
          task_id: string
          user_wallet: string
        }
        Update: {
          activity_id?: string
          campaign_id?: string
          completion_id?: string
          created_at?: string
          task_id?: string
          user_wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_completion_activitie_completion_id_campaign_id_ta_fkey"
            columns: ["completion_id", "campaign_id", "task_id", "user_wallet"]
            isOneToOne: false
            referencedRelation: "campaign_completions"
            referencedColumns: [
              "completion_id",
              "campaign_id",
              "task_id",
              "user_wallet",
            ]
          },
        ]
      }
      campaign_completions: {
        Row: {
          campaign_id: string
          completed_at: string
          completion_id: string
          created_at: string
          points: number
          task_id: string
          user_wallet: string
        }
        Insert: {
          campaign_id: string
          completed_at?: string
          completion_id: string
          created_at?: string
          points: number
          task_id: string
          user_wallet: string
        }
        Update: {
          campaign_id?: string
          completed_at?: string
          completion_id?: string
          created_at?: string
          points?: number
          task_id?: string
          user_wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_completions_campaign_id_task_id_fkey"
            columns: ["campaign_id", "task_id"]
            isOneToOne: false
            referencedRelation: "campaign_tasks"
            referencedColumns: ["campaign_id", "task_id"]
          },
        ]
      }
      campaign_points_ledger: {
        Row: {
          campaign_id: string
          completion_id: string
          created_at: string
          ledger_id: string
          points_delta: number
          reason: string
          task_id: string
          user_wallet: string
        }
        Insert: {
          campaign_id: string
          completion_id: string
          created_at?: string
          ledger_id?: string
          points_delta: number
          reason?: string
          task_id: string
          user_wallet: string
        }
        Update: {
          campaign_id?: string
          completion_id?: string
          created_at?: string
          ledger_id?: string
          points_delta?: number
          reason?: string
          task_id?: string
          user_wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_points_ledger_completion_id_campaign_id_task_id_u_fkey"
            columns: ["completion_id", "campaign_id", "task_id", "user_wallet"]
            isOneToOne: false
            referencedRelation: "campaign_completions"
            referencedColumns: [
              "completion_id",
              "campaign_id",
              "task_id",
              "user_wallet",
            ]
          },
        ]
      }
      campaign_tasks: {
        Row: {
          campaign_id: string
          completion_limit_per_wallet: number
          created_at: string
          description: string | null
          points: number
          required_count: number
          rules: Json
          sort_order: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          completion_limit_per_wallet?: number
          created_at?: string
          description?: string | null
          points: number
          required_count: number
          rules?: Json
          sort_order?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          completion_limit_per_wallet?: number
          created_at?: string
          description?: string | null
          points?: number
          required_count?: number
          rules?: Json
          sort_order?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaigns: {
        Row: {
          campaign_id: string
          created_at: string
          description: string | null
          ends_at: string
          metadata: Json
          name: string
          slug: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          description?: string | null
          ends_at: string
          metadata?: Json
          name: string
          slug: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          description?: string | null
          ends_at?: string
          metadata?: Json
          name?: string
          slug?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          binding_changes_count: number
          claimed_tokens: number
          created_at: string
          email: string
          flow_points: number
          id: string
          last_binding_change: string | null
          points_referral_activity: number
          points_referral_signup: number
          points_self: number
          referral_code: string | null
          referred_by: string | null
          total_swap_volume_usd: number
          wallet_address: string | null
        }
        Insert: {
          binding_changes_count?: number
          claimed_tokens?: number
          created_at?: string
          email?: string
          flow_points?: number
          id: string
          last_binding_change?: string | null
          points_referral_activity?: number
          points_referral_signup?: number
          points_self?: number
          referral_code?: string | null
          referred_by?: string | null
          total_swap_volume_usd?: number
          wallet_address?: string | null
        }
        Update: {
          binding_changes_count?: number
          claimed_tokens?: number
          created_at?: string
          email?: string
          flow_points?: number
          id?: string
          last_binding_change?: string | null
          points_referral_activity?: number
          points_referral_signup?: number
          points_self?: number
          referral_code?: string | null
          referred_by?: string | null
          total_swap_volume_usd?: number
          wallet_address?: string | null
        }
        Relationships: []
      }
      proposals: {
        Row: {
          author: string
          category: string
          created_at: string
          id: string
          text: string
          votes: number
        }
        Insert: {
          author?: string
          category: string
          created_at?: string
          id: string
          text: string
          votes?: number
        }
        Update: {
          author?: string
          category?: string
          created_at?: string
          id?: string
          text?: string
          votes?: number
        }
        Relationships: []
      }
      siwe_nonces: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          nonce: string
          used_at: string | null
          wallet_address: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          nonce: string
          used_at?: string | null
          wallet_address: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string
          used_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      social_follows: {
        Row: {
          telegram_confirmed_at: string | null
          telegram_handle: string | null
          updated_at: string
          user_id: string
          x_confirmed_at: string | null
          x_handle: string | null
          youtube_confirmed_at: string | null
          youtube_handle: string | null
        }
        Insert: {
          telegram_confirmed_at?: string | null
          telegram_handle?: string | null
          updated_at?: string
          user_id: string
          x_confirmed_at?: string | null
          x_handle?: string | null
          youtube_confirmed_at?: string | null
          youtube_handle?: string | null
        }
        Update: {
          telegram_confirmed_at?: string | null
          telegram_handle?: string | null
          updated_at?: string
          user_id?: string
          x_confirmed_at?: string | null
          x_handle?: string | null
          youtube_confirmed_at?: string | null
          youtube_handle?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      swap_tokens: {
        Row: {
          address: string
          chain: string
          created_at: string
          created_by: string | null
          decimals: number
          id: string
          is_active: boolean
          liquidity_verified: boolean
          logo_url: string | null
          name: string
          router_id: number | null
          sort_order: number
          symbol: string
          updated_at: string
        }
        Insert: {
          address: string
          chain: string
          created_at?: string
          created_by?: string | null
          decimals?: number
          id?: string
          is_active?: boolean
          liquidity_verified?: boolean
          logo_url?: string | null
          name: string
          router_id?: number | null
          sort_order?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          created_by?: string | null
          decimals?: number
          id?: string
          is_active?: boolean
          liquidity_verified?: boolean
          logo_url?: string | null
          name?: string
          router_id?: number | null
          sort_order?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions_history: {
        Row: {
          created_at: string
          direction: string
          from_amount: string
          id: string
          points_earned: number
          status: string
          to_amount: string
          tx_hash: string | null
          tx_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          from_amount: string
          id?: string
          points_earned?: number
          status: string
          to_amount: string
          tx_hash?: string | null
          tx_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          from_amount?: string
          id?: string
          points_earned?: number
          status?: string
          to_amount?: string
          tx_hash?: string | null
          tx_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_bind_wallet: {
        Args: { p_user_id: string; p_wallet: string }
        Returns: {
          binding_changes_count: number
          claimed_tokens: number
          created_at: string
          email: string
          flow_points: number
          id: string
          last_binding_change: string | null
          points_referral_activity: number
          points_referral_signup: number
          points_self: number
          referral_code: string | null
          referred_by: string | null
          total_swap_volume_usd: number
          wallet_address: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_settle_campaign_completion: {
        Args: {
          p_activity_ids: string[]
          p_campaign_id: string
          p_completed_at?: string
          p_completion_id: string
          p_task_id: string
          p_user_wallet: string
        }
        Returns: {
          completion_id: string
          inserted: boolean
          points_awarded: number
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      purge_siwe_nonces: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
