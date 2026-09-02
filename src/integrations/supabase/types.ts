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
      admin_audit_events: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string
          actor_user_id: string | null
          created_at: string
          event_id: string
          new_value: Json | null
          object_id: string
          object_type: string
          old_value: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role: string
          actor_user_id?: string | null
          created_at?: string
          event_id?: string
          new_value?: Json | null
          object_id: string
          object_type: string
          old_value?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          event_id?: string
          new_value?: Json | null
          object_id?: string
          object_type?: string
          old_value?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      ai_action_intents: {
        Row: {
          canonical: Json
          chain_id: number
          created_at: string
          digest: string
          expires_at: string
          id: string
          intent_type: string
          schema_version: string
          user_id: string
        }
        Insert: {
          canonical: Json
          chain_id: number
          created_at?: string
          digest: string
          expires_at: string
          id: string
          intent_type: string
          schema_version: string
          user_id: string
        }
        Update: {
          canonical?: Json
          chain_id?: number
          created_at?: string
          digest?: string
          expires_at?: string
          id?: string
          intent_type?: string
          schema_version?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_missions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step_id: string | null
          expires_at: string
          goal_text: string
          id: string
          mission: Json
          schema_version: string
          source_opportunity_id: string | null
          source_opportunity_kind: string | null
          status: string
          template_id: string | null
          template_version: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          expires_at: string
          goal_text: string
          id: string
          mission: Json
          schema_version: string
          source_opportunity_id?: string | null
          source_opportunity_kind?: string | null
          status: string
          template_id?: string | null
          template_version?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step_id?: string | null
          expires_at?: string
          goal_text?: string
          id?: string
          mission?: Json
          schema_version?: string
          source_opportunity_id?: string | null
          source_opportunity_kind?: string | null
          status?: string
          template_id?: string | null
          template_version?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      ai_opportunity_state: {
        Row: {
          created_at: string
          dismissed_at: string | null
          id: string
          last_seen_at: string | null
          opportunity_key: string
          snoozed_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          id?: string
          last_seen_at?: string | null
          opportunity_key: string
          snoozed_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          id?: string
          last_seen_at?: string | null
          opportunity_key?: string
          snoozed_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_user_memory: {
        Row: {
          created_at: string
          id: string
          key: string
          origin: string
          promoted: boolean
          scope: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          origin?: string
          promoted?: boolean
          scope?: string
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          origin?: string
          promoted?: boolean
          scope?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      app_admins: {
        Row: {
          created_at: string
          email: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          role?: string
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
      campaign_review_events: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          campaign_id: string
          created_at: string
          event_id: string
          from_state:
            | Database["public"]["Enums"]["campaign_review_state"]
            | null
          note: string | null
          organization_id: string
          revision: number
          to_state: Database["public"]["Enums"]["campaign_review_state"] | null
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id?: string | null
          campaign_id: string
          created_at?: string
          event_id?: string
          from_state?:
            | Database["public"]["Enums"]["campaign_review_state"]
            | null
          note?: string | null
          organization_id: string
          revision?: number
          to_state?: Database["public"]["Enums"]["campaign_review_state"] | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          campaign_id?: string
          created_at?: string
          event_id?: string
          from_state?:
            | Database["public"]["Enums"]["campaign_review_state"]
            | null
          note?: string | null
          organization_id?: string
          revision?: number
          to_state?: Database["public"]["Enums"]["campaign_review_state"] | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_review_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_review_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["org_id"]
          },
        ]
      }
      campaign_submission_revisions: {
        Row: {
          campaign_id: string
          fingerprint: string
          organization_id: string
          published_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          revision_id: string
          snapshot: Json
          status: string
          submitted_at: string
          submitted_by: string | null
        }
        Insert: {
          campaign_id: string
          fingerprint: string
          organization_id: string
          published_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision: number
          revision_id?: string
          snapshot: Json
          status?: string
          submitted_at?: string
          submitted_by?: string | null
        }
        Update: {
          campaign_id?: string
          fingerprint?: string
          organization_id?: string
          published_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          revision_id?: string
          snapshot?: Json
          status?: string
          submitted_at?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_submission_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_submission_revisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["org_id"]
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
          created_by: string | null
          description: string | null
          ends_at: string
          metadata: Json
          name: string
          organization_id: string
          pts_budget: number
          published_revision: number | null
          published_revision_id: string | null
          review_note: string | null
          review_state: Database["public"]["Enums"]["campaign_review_state"]
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          reward_type: Database["public"]["Enums"]["campaign_reward_type"]
          slug: string
          starts_at: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          metadata?: Json
          name: string
          organization_id?: string
          pts_budget?: number
          published_revision?: number | null
          published_revision_id?: string | null
          review_note?: string | null
          review_state?: Database["public"]["Enums"]["campaign_review_state"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          reward_type?: Database["public"]["Enums"]["campaign_reward_type"]
          slug: string
          starts_at: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          metadata?: Json
          name?: string
          organization_id?: string
          pts_budget?: number
          published_revision?: number | null
          published_revision_id?: string | null
          review_note?: string | null
          review_state?: Database["public"]["Enums"]["campaign_review_state"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          reward_type?: Database["public"]["Enums"]["campaign_reward_type"]
          slug?: string
          starts_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["org_id"]
          },
        ]
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
      flow_points_ledger: {
        Row: {
          activity_key: string | null
          base_points: number
          chain_id: number | null
          created_at: string
          day_key: string | null
          id: string
          metadata: Json | null
          points: number
          policy_version: string
          reason: string
          source_log_index: number | null
          tx_hash: string | null
          user_id: string
          verified_activity_id: string | null
          verified_usd: number | null
          wallet_address: string | null
        }
        Insert: {
          activity_key?: string | null
          base_points?: number
          chain_id?: number | null
          created_at?: string
          day_key?: string | null
          id?: string
          metadata?: Json | null
          points?: number
          policy_version?: string
          reason: string
          source_log_index?: number | null
          tx_hash?: string | null
          user_id: string
          verified_activity_id?: string | null
          verified_usd?: number | null
          wallet_address?: string | null
        }
        Update: {
          activity_key?: string | null
          base_points?: number
          chain_id?: number | null
          created_at?: string
          day_key?: string | null
          id?: string
          metadata?: Json | null
          points?: number
          policy_version?: string
          reason?: string
          source_log_index?: number | null
          tx_hash?: string | null
          user_id?: string
          verified_activity_id?: string | null
          verified_usd?: number | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_points_ledger_verified_activity_id_fkey"
            columns: ["verified_activity_id"]
            isOneToOne: false
            referencedRelation: "verified_activities"
            referencedColumns: ["activity_id"]
          },
        ]
      }
      mainnet_release_decisions: {
        Row: {
          action: string
          approved_at: string
          approved_by_email: string
          approved_by_user: string | null
          approved_value: Json | null
          candidate_digest: string
          created_at: string
          decision_hash: string | null
          decision_id: string
          decision_version: string
          id: string
          note: string | null
        }
        Insert: {
          action: string
          approved_at?: string
          approved_by_email: string
          approved_by_user?: string | null
          approved_value?: Json | null
          candidate_digest: string
          created_at?: string
          decision_hash?: string | null
          decision_id: string
          decision_version: string
          id?: string
          note?: string | null
        }
        Update: {
          action?: string
          approved_at?: string
          approved_by_email?: string
          approved_by_user?: string | null
          approved_value?: Json | null
          candidate_digest?: string
          created_at?: string
          decision_hash?: string | null
          decision_id?: string
          decision_version?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      partner_org_members: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["partner_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["partner_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["partner_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["org_id"]
          },
        ]
      }
      partner_organizations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          is_system: boolean
          name: string
          org_id: string
          risk_notes: string | null
          slug: string
          status: Database["public"]["Enums"]["partner_org_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          is_system?: boolean
          name: string
          org_id?: string
          risk_notes?: string | null
          slug: string
          status?: Database["public"]["Enums"]["partner_org_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          is_system?: boolean
          name?: string
          org_id?: string
          risk_notes?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["partner_org_status"]
          updated_at?: string
          website?: string | null
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
      referral_milestone_awards: {
        Row: {
          created_at: string
          id: string
          milestone: string
          month_key: string
          points: number
          policy_version: string
          referee_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          milestone: string
          month_key: string
          points?: number
          policy_version?: string
          referee_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          milestone?: string
          month_key?: string
          points?: number
          policy_version?: string
          referee_id?: string
          referrer_id?: string
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
      verified_activities: {
        Row: {
          action_type: string
          activity_id: string
          amount_raw: string
          campaign_id: string
          created_at: string
          destination_chain_id: number
          evidence_source: string
          intent_hash: string | null
          intent_nonce: string | null
          kind: string
          observed_at: string
          occurred_at: string
          source_chain_id: number
          source_log_index: number
          source_tx_hash: string
          status: string
          token: string
          user_wallet: string
        }
        Insert: {
          action_type: string
          activity_id: string
          amount_raw: string
          campaign_id: string
          created_at?: string
          destination_chain_id: number
          evidence_source?: string
          intent_hash?: string | null
          intent_nonce?: string | null
          kind: string
          observed_at: string
          occurred_at: string
          source_chain_id: number
          source_log_index: number
          source_tx_hash: string
          status?: string
          token: string
          user_wallet: string
        }
        Update: {
          action_type?: string
          activity_id?: string
          amount_raw?: string
          campaign_id?: string
          created_at?: string
          destination_chain_id?: number
          evidence_source?: string
          intent_hash?: string | null
          intent_nonce?: string | null
          kind?: string
          observed_at?: string
          occurred_at?: string
          source_chain_id?: number
          source_log_index?: number
          source_tx_hash?: string
          status?: string
          token?: string
          user_wallet?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_bind_core_swap_evidence: {
        Args: {
          p_activity_id: string
          p_chain_id: number
          p_source_log_index: number
          p_tx_hash: string
        }
        Returns: {
          out_activity_key: string
          out_base_points: number
          out_bound: boolean
          out_ledger_id: string
          out_points: number
        }[]
      }
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
      admin_record_router_v3_swap_evidence: {
        Args: {
          p_action_type: string
          p_activity_id: string
          p_amount_raw: number
          p_occurred_at: string
          p_source_chain_id: number
          p_source_log_index: number
          p_source_tx_hash: string
          p_token: string
          p_user_wallet: string
        }
        Returns: {
          activity_id: string
          inserted: boolean
        }[]
      }
      admin_record_verified_activity: {
        Args: {
          p_action_type: string
          p_activity_id: string
          p_amount_raw: string
          p_campaign_id: string
          p_destination_chain_id: number
          p_intent_hash: string
          p_intent_nonce: string
          p_kind: string
          p_observed_at: string
          p_occurred_at: string
          p_source_chain_id: number
          p_source_log_index: number
          p_source_tx_hash: string
          p_token: string
          p_user_wallet: string
        }
        Returns: {
          activity_id: string
          inserted: boolean
        }[]
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
      campaign_review_state:
        | "draft"
        | "submitted"
        | "changes_requested"
        | "approved"
        | "published"
        | "paused"
        | "ended"
      campaign_reward_type: "campaign_pts" | "flow_points_bonus" | "flow_token"
      partner_member_role: "partner_admin" | "partner_editor" | "partner_viewer"
      partner_org_status: "pending" | "verified" | "rejected" | "suspended"
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
      campaign_review_state: [
        "draft",
        "submitted",
        "changes_requested",
        "approved",
        "published",
        "paused",
        "ended",
      ],
      campaign_reward_type: ["campaign_pts", "flow_points_bonus", "flow_token"],
      partner_member_role: [
        "partner_admin",
        "partner_editor",
        "partner_viewer",
      ],
      partner_org_status: ["pending", "verified", "rejected", "suspended"],
    },
  },
} as const
