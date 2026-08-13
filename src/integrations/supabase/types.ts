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
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_name: string | null
          actor_role: string | null
          affected_records: Json
          created_at: string
          id: string
          notes: string | null
          reset_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_name?: string | null
          actor_role?: string | null
          affected_records?: Json
          created_at?: string
          id?: string
          notes?: string | null
          reset_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_name?: string | null
          actor_role?: string | null
          affected_records?: Json
          created_at?: string
          id?: string
          notes?: string | null
          reset_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      amazon_discovery_candidates: {
        Row: {
          candidate_type: string
          candidate_url: string
          creator_name: string | null
          discovered_at: string
          discovered_by: string | null
          id: string
          notes: string | null
          promoted_creator_id: string | null
          reviewed_at: string | null
          seed_url: string
          source_label: string
          status: string
        }
        Insert: {
          candidate_type?: string
          candidate_url: string
          creator_name?: string | null
          discovered_at?: string
          discovered_by?: string | null
          id?: string
          notes?: string | null
          promoted_creator_id?: string | null
          reviewed_at?: string | null
          seed_url: string
          source_label?: string
          status?: string
        }
        Update: {
          candidate_type?: string
          candidate_url?: string
          creator_name?: string | null
          discovered_at?: string
          discovered_by?: string | null
          id?: string
          notes?: string | null
          promoted_creator_id?: string | null
          reviewed_at?: string | null
          seed_url?: string
          source_label?: string
          status?: string
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_workspace: {
        Row: {
          activity: Json
          address_received: boolean
          ai_recommendation: string | null
          assigned_date: string | null
          assigned_to: string | null
          carrier: string | null
          commission_rate: number | null
          commission_sales_usd: number | null
          contact_attempts: Json
          contact_method: string | null
          content_deadline: string | null
          content_pieces: Json
          content_promised: string | null
          content_received: boolean
          content_status: string | null
          created_at: string
          created_by: string | null
          created_by_role: string | null
          creator_id: string
          current_owner: string | null
          date_sent: string | null
          deal_type: string
          delivery_status: string | null
          do_not_contact: boolean
          email_draft_created: boolean
          email_override: string | null
          email_sent: boolean
          executive_notes: string | null
          flat_fee_usd: number | null
          follow_up_count: number
          gmail_confirmed_at: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          important_flag: boolean
          important_note: string | null
          last_activity_by: string | null
          last_contact_date: string | null
          last_modified_at: string | null
          last_modified_by: string | null
          last_modified_by_role: string | null
          next_follow_up_date: string | null
          no_response: boolean
          outreach_status: string | null
          payout_notes: string | null
          product_requested: string | null
          publish_date: string | null
          published_platforms: Json
          quantity: number | null
          research_notes: string | null
          responded: boolean
          revenue_attributed_usd: number | null
          review_status: string
          roi_ratio: number | null
          roi_updated_at: string | null
          sample_cost_usd: number | null
          sample_required: boolean
          sample_shipped: boolean
          saved_gmail_draft: Json | null
          shipping_address1: string | null
          shipping_address2: string | null
          shipping_city: string | null
          shipping_company: string | null
          shipping_cost_usd: number | null
          shipping_country: string | null
          shipping_name: string | null
          shipping_note: string | null
          shipping_postal_code: string | null
          shipping_state: string | null
          supervisor: string | null
          team_notes: string | null
          total_cost_usd: number | null
          tracking_number: string | null
          updated_at: string
          waiting_for_reply: boolean
        }
        Insert: {
          activity?: Json
          address_received?: boolean
          ai_recommendation?: string | null
          assigned_date?: string | null
          assigned_to?: string | null
          carrier?: string | null
          commission_rate?: number | null
          commission_sales_usd?: number | null
          contact_attempts?: Json
          contact_method?: string | null
          content_deadline?: string | null
          content_pieces?: Json
          content_promised?: string | null
          content_received?: boolean
          content_status?: string | null
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          creator_id: string
          current_owner?: string | null
          date_sent?: string | null
          deal_type?: string
          delivery_status?: string | null
          do_not_contact?: boolean
          email_draft_created?: boolean
          email_override?: string | null
          email_sent?: boolean
          executive_notes?: string | null
          flat_fee_usd?: number | null
          follow_up_count?: number
          gmail_confirmed_at?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          important_flag?: boolean
          important_note?: string | null
          last_activity_by?: string | null
          last_contact_date?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          last_modified_by_role?: string | null
          next_follow_up_date?: string | null
          no_response?: boolean
          outreach_status?: string | null
          payout_notes?: string | null
          product_requested?: string | null
          publish_date?: string | null
          published_platforms?: Json
          quantity?: number | null
          research_notes?: string | null
          responded?: boolean
          revenue_attributed_usd?: number | null
          review_status?: string
          roi_ratio?: number | null
          roi_updated_at?: string | null
          sample_cost_usd?: number | null
          sample_required?: boolean
          sample_shipped?: boolean
          saved_gmail_draft?: Json | null
          shipping_address1?: string | null
          shipping_address2?: string | null
          shipping_city?: string | null
          shipping_company?: string | null
          shipping_cost_usd?: number | null
          shipping_country?: string | null
          shipping_name?: string | null
          shipping_note?: string | null
          shipping_postal_code?: string | null
          shipping_state?: string | null
          supervisor?: string | null
          team_notes?: string | null
          total_cost_usd?: number | null
          tracking_number?: string | null
          updated_at?: string
          waiting_for_reply?: boolean
        }
        Update: {
          activity?: Json
          address_received?: boolean
          ai_recommendation?: string | null
          assigned_date?: string | null
          assigned_to?: string | null
          carrier?: string | null
          commission_rate?: number | null
          commission_sales_usd?: number | null
          contact_attempts?: Json
          contact_method?: string | null
          content_deadline?: string | null
          content_pieces?: Json
          content_promised?: string | null
          content_received?: boolean
          content_status?: string | null
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          creator_id?: string
          current_owner?: string | null
          date_sent?: string | null
          deal_type?: string
          delivery_status?: string | null
          do_not_contact?: boolean
          email_draft_created?: boolean
          email_override?: string | null
          email_sent?: boolean
          executive_notes?: string | null
          flat_fee_usd?: number | null
          follow_up_count?: number
          gmail_confirmed_at?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          important_flag?: boolean
          important_note?: string | null
          last_activity_by?: string | null
          last_contact_date?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          last_modified_by_role?: string | null
          next_follow_up_date?: string | null
          no_response?: boolean
          outreach_status?: string | null
          payout_notes?: string | null
          product_requested?: string | null
          publish_date?: string | null
          published_platforms?: Json
          quantity?: number | null
          research_notes?: string | null
          responded?: boolean
          revenue_attributed_usd?: number | null
          review_status?: string
          roi_ratio?: number | null
          roi_updated_at?: string | null
          sample_cost_usd?: number | null
          sample_required?: boolean
          sample_shipped?: boolean
          saved_gmail_draft?: Json | null
          shipping_address1?: string | null
          shipping_address2?: string | null
          shipping_city?: string | null
          shipping_company?: string | null
          shipping_cost_usd?: number | null
          shipping_country?: string | null
          shipping_name?: string | null
          shipping_note?: string | null
          shipping_postal_code?: string | null
          shipping_state?: string | null
          supervisor?: string | null
          team_notes?: string | null
          total_cost_usd?: number | null
          tracking_number?: string | null
          updated_at?: string
          waiting_for_reply?: boolean
        }
        Relationships: []
      }
      creators: {
        Row: {
          amazon: string | null
          amazon_confidence: string | null
          amazon_content_analysis: string | null
          amazon_discovery_source: string | null
          amazon_fit_score: number | null
          amazon_reviewed_survival_tabs: boolean | null
          amazon_shoppable_video: boolean | null
          amazon_storefront_url: string | null
          amazon_video_url: string | null
          code: string | null
          contact_confidence: string | null
          contact_method: string | null
          contact_route: string | null
          contacted_date: string | null
          created_at: string
          creator_code: string | null
          email: string | null
          facebook: string | null
          followers_signal: string | null
          full_verification: string | null
          geography: string | null
          geography_confidence: string | null
          id: string
          imported_by: string | null
          instagram: string | null
          last_researched: string | null
          monetization: string | null
          name: string
          normalized_domain: string | null
          offer_confidence: string | null
          offer_reasoning: string | null
          other_platform: string | null
          outreach_owner: string | null
          partnership_tier: string | null
          perry_comments: string | null
          primary_platforms: string | null
          primary_source: string | null
          priority: string | null
          reach_signal: string | null
          recent_activity_check: string | null
          recommended_offer: string | null
          rena_notes: string | null
          research_notes: string | null
          research_status: string | null
          response_followup: string | null
          sample_status: string | null
          segment: string | null
          seth_next_action: string | null
          target_audience: string | null
          technical_notes: string | null
          tiktok: string | null
          tuan_affiliate_status: string | null
          updated_at: string
          verification_date: string | null
          verification_evidence: string | null
          youtube: string | null
        }
        Insert: {
          amazon?: string | null
          amazon_confidence?: string | null
          amazon_content_analysis?: string | null
          amazon_discovery_source?: string | null
          amazon_fit_score?: number | null
          amazon_reviewed_survival_tabs?: boolean | null
          amazon_shoppable_video?: boolean | null
          amazon_storefront_url?: string | null
          amazon_video_url?: string | null
          code?: string | null
          contact_confidence?: string | null
          contact_method?: string | null
          contact_route?: string | null
          contacted_date?: string | null
          created_at?: string
          creator_code?: string | null
          email?: string | null
          facebook?: string | null
          followers_signal?: string | null
          full_verification?: string | null
          geography?: string | null
          geography_confidence?: string | null
          id: string
          imported_by?: string | null
          instagram?: string | null
          last_researched?: string | null
          monetization?: string | null
          name: string
          normalized_domain?: string | null
          offer_confidence?: string | null
          offer_reasoning?: string | null
          other_platform?: string | null
          outreach_owner?: string | null
          partnership_tier?: string | null
          perry_comments?: string | null
          primary_platforms?: string | null
          primary_source?: string | null
          priority?: string | null
          reach_signal?: string | null
          recent_activity_check?: string | null
          recommended_offer?: string | null
          rena_notes?: string | null
          research_notes?: string | null
          research_status?: string | null
          response_followup?: string | null
          sample_status?: string | null
          segment?: string | null
          seth_next_action?: string | null
          target_audience?: string | null
          technical_notes?: string | null
          tiktok?: string | null
          tuan_affiliate_status?: string | null
          updated_at?: string
          verification_date?: string | null
          verification_evidence?: string | null
          youtube?: string | null
        }
        Update: {
          amazon?: string | null
          amazon_confidence?: string | null
          amazon_content_analysis?: string | null
          amazon_discovery_source?: string | null
          amazon_fit_score?: number | null
          amazon_reviewed_survival_tabs?: boolean | null
          amazon_shoppable_video?: boolean | null
          amazon_storefront_url?: string | null
          amazon_video_url?: string | null
          code?: string | null
          contact_confidence?: string | null
          contact_method?: string | null
          contact_route?: string | null
          contacted_date?: string | null
          created_at?: string
          creator_code?: string | null
          email?: string | null
          facebook?: string | null
          followers_signal?: string | null
          full_verification?: string | null
          geography?: string | null
          geography_confidence?: string | null
          id?: string
          imported_by?: string | null
          instagram?: string | null
          last_researched?: string | null
          monetization?: string | null
          name?: string
          normalized_domain?: string | null
          offer_confidence?: string | null
          offer_reasoning?: string | null
          other_platform?: string | null
          outreach_owner?: string | null
          partnership_tier?: string | null
          perry_comments?: string | null
          primary_platforms?: string | null
          primary_source?: string | null
          priority?: string | null
          reach_signal?: string | null
          recent_activity_check?: string | null
          recommended_offer?: string | null
          rena_notes?: string | null
          research_notes?: string | null
          research_status?: string | null
          response_followup?: string | null
          sample_status?: string | null
          segment?: string | null
          seth_next_action?: string | null
          target_audience?: string | null
          technical_notes?: string | null
          tiktok?: string | null
          tuan_affiliate_status?: string | null
          updated_at?: string
          verification_date?: string | null
          verification_evidence?: string | null
          youtube?: string | null
        }
        Relationships: []
      }
      creators_archive: {
        Row: {
          amazon: string | null
          amazon_confidence: string | null
          code: string | null
          contact_confidence: string | null
          contact_method: string | null
          contact_route: string | null
          contacted_date: string | null
          created_at: string
          creator_code: string | null
          email: string | null
          facebook: string | null
          followers_signal: string | null
          full_verification: string | null
          geography: string | null
          geography_confidence: string | null
          id: string
          imported_by: string | null
          instagram: string | null
          last_researched: string | null
          monetization: string | null
          name: string
          normalized_domain: string | null
          offer_confidence: string | null
          offer_reasoning: string | null
          other_platform: string | null
          outreach_owner: string | null
          partnership_tier: string | null
          perry_comments: string | null
          primary_platforms: string | null
          primary_source: string | null
          priority: string | null
          reach_signal: string | null
          recent_activity_check: string | null
          recommended_offer: string | null
          rena_notes: string | null
          research_notes: string | null
          research_status: string | null
          response_followup: string | null
          sample_status: string | null
          segment: string | null
          seth_next_action: string | null
          target_audience: string | null
          technical_notes: string | null
          tiktok: string | null
          tuan_affiliate_status: string | null
          updated_at: string
          verification_date: string | null
          verification_evidence: string | null
          youtube: string | null
        }
        Insert: {
          amazon?: string | null
          amazon_confidence?: string | null
          code?: string | null
          contact_confidence?: string | null
          contact_method?: string | null
          contact_route?: string | null
          contacted_date?: string | null
          created_at?: string
          creator_code?: string | null
          email?: string | null
          facebook?: string | null
          followers_signal?: string | null
          full_verification?: string | null
          geography?: string | null
          geography_confidence?: string | null
          id: string
          imported_by?: string | null
          instagram?: string | null
          last_researched?: string | null
          monetization?: string | null
          name: string
          normalized_domain?: string | null
          offer_confidence?: string | null
          offer_reasoning?: string | null
          other_platform?: string | null
          outreach_owner?: string | null
          partnership_tier?: string | null
          perry_comments?: string | null
          primary_platforms?: string | null
          primary_source?: string | null
          priority?: string | null
          reach_signal?: string | null
          recent_activity_check?: string | null
          recommended_offer?: string | null
          rena_notes?: string | null
          research_notes?: string | null
          research_status?: string | null
          response_followup?: string | null
          sample_status?: string | null
          segment?: string | null
          seth_next_action?: string | null
          target_audience?: string | null
          technical_notes?: string | null
          tiktok?: string | null
          tuan_affiliate_status?: string | null
          updated_at?: string
          verification_date?: string | null
          verification_evidence?: string | null
          youtube?: string | null
        }
        Update: {
          amazon?: string | null
          amazon_confidence?: string | null
          code?: string | null
          contact_confidence?: string | null
          contact_method?: string | null
          contact_route?: string | null
          contacted_date?: string | null
          created_at?: string
          creator_code?: string | null
          email?: string | null
          facebook?: string | null
          followers_signal?: string | null
          full_verification?: string | null
          geography?: string | null
          geography_confidence?: string | null
          id?: string
          imported_by?: string | null
          instagram?: string | null
          last_researched?: string | null
          monetization?: string | null
          name?: string
          normalized_domain?: string | null
          offer_confidence?: string | null
          offer_reasoning?: string | null
          other_platform?: string | null
          outreach_owner?: string | null
          partnership_tier?: string | null
          perry_comments?: string | null
          primary_platforms?: string | null
          primary_source?: string | null
          priority?: string | null
          reach_signal?: string | null
          recent_activity_check?: string | null
          recommended_offer?: string | null
          rena_notes?: string | null
          research_notes?: string | null
          research_status?: string | null
          response_followup?: string | null
          sample_status?: string | null
          segment?: string | null
          seth_next_action?: string | null
          target_audience?: string | null
          technical_notes?: string | null
          tiktok?: string | null
          tuan_affiliate_status?: string | null
          updated_at?: string
          verification_date?: string | null
          verification_evidence?: string | null
          youtube?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          body: string
          created_at: string
          created_by: string
          id: string
          name: string
          segment: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          name: string
          segment?: string | null
          subject?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          segment?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      gmail_messages: {
        Row: {
          body_text: string | null
          cc_emails: string[]
          created_at: string
          creator_id: string | null
          direction: string
          from_email: string | null
          from_name: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          has_attachments: boolean
          id: string
          label_ids: string[]
          sent_at: string | null
          snippet: string | null
          subject: string | null
          to_emails: string[]
          user_id: string
        }
        Insert: {
          body_text?: string | null
          cc_emails?: string[]
          created_at?: string
          creator_id?: string | null
          direction: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          has_attachments?: boolean
          id?: string
          label_ids?: string[]
          sent_at?: string | null
          snippet?: string | null
          subject?: string | null
          to_emails?: string[]
          user_id: string
        }
        Update: {
          body_text?: string | null
          cc_emails?: string[]
          created_at?: string
          creator_id?: string | null
          direction?: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          has_attachments?: boolean
          id?: string
          label_ids?: string[]
          sent_at?: string | null
          snippet?: string | null
          subject?: string | null
          to_emails?: string[]
          user_id?: string
        }
        Relationships: []
      }
      gmail_poll_state: {
        Row: {
          email_address: string | null
          label_ids: Json
          last_error_at: string | null
          last_error_reason: string | null
          last_error_status: number | null
          last_history_id: string | null
          last_polled_at: string | null
          last_success_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          email_address?: string | null
          label_ids?: Json
          last_error_at?: string | null
          last_error_reason?: string | null
          last_error_status?: number | null
          last_history_id?: string | null
          last_polled_at?: string | null
          last_success_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          email_address?: string | null
          label_ids?: Json
          last_error_at?: string | null
          last_error_reason?: string | null
          last_error_status?: number | null
          last_history_id?: string | null
          last_polled_at?: string | null
          last_success_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gmail_send_errors: {
        Row: {
          action: string
          created_at: string
          creator_id: string | null
          creator_name: string | null
          error_reason: string | null
          http_status: number | null
          id: string
          recipient: string | null
          sender_email: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          creator_id?: string | null
          creator_name?: string | null
          error_reason?: string | null
          http_status?: number | null
          id?: string
          recipient?: string | null
          sender_email?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          creator_id?: string | null
          creator_name?: string | null
          error_reason?: string | null
          http_status?: number | null
          id?: string
          recipient?: string | null
          sender_email?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          last_seen_at: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          last_seen_at?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          last_seen_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviewed_creators: {
        Row: {
          amazon: string | null
          amazon_confidence: string | null
          amazon_content_analysis: string | null
          amazon_discovery_source: string | null
          amazon_fit_score: number | null
          amazon_reviewed_survival_tabs: boolean | null
          amazon_shoppable_video: boolean | null
          amazon_storefront_url: string | null
          amazon_video_url: string | null
          code: string | null
          contact_confidence: string | null
          contact_method: string | null
          contact_route: string | null
          contacted_date: string | null
          created_at: string
          creator_code: string | null
          email: string | null
          facebook: string | null
          followers_signal: string | null
          full_verification: string | null
          geography: string | null
          geography_confidence: string | null
          id: string
          imported_by: string | null
          instagram: string | null
          last_researched: string | null
          monetization: string | null
          name: string
          normalized_domain: string | null
          offer_confidence: string | null
          offer_reasoning: string | null
          other_platform: string | null
          outreach_owner: string | null
          partnership_tier: string | null
          perry_comments: string | null
          primary_platforms: string | null
          primary_source: string | null
          priority: string | null
          reach_signal: string | null
          recent_activity_check: string | null
          recommended_offer: string | null
          rena_notes: string | null
          research_notes: string | null
          research_status: string | null
          response_followup: string | null
          sample_status: string | null
          segment: string | null
          seth_next_action: string | null
          target_audience: string | null
          technical_notes: string | null
          tiktok: string | null
          tuan_affiliate_status: string | null
          updated_at: string
          verification_date: string | null
          verification_evidence: string | null
          youtube: string | null
        }
        Insert: {
          amazon?: string | null
          amazon_confidence?: string | null
          amazon_content_analysis?: string | null
          amazon_discovery_source?: string | null
          amazon_fit_score?: number | null
          amazon_reviewed_survival_tabs?: boolean | null
          amazon_shoppable_video?: boolean | null
          amazon_storefront_url?: string | null
          amazon_video_url?: string | null
          code?: string | null
          contact_confidence?: string | null
          contact_method?: string | null
          contact_route?: string | null
          contacted_date?: string | null
          created_at?: string
          creator_code?: string | null
          email?: string | null
          facebook?: string | null
          followers_signal?: string | null
          full_verification?: string | null
          geography?: string | null
          geography_confidence?: string | null
          id: string
          imported_by?: string | null
          instagram?: string | null
          last_researched?: string | null
          monetization?: string | null
          name: string
          normalized_domain?: string | null
          offer_confidence?: string | null
          offer_reasoning?: string | null
          other_platform?: string | null
          outreach_owner?: string | null
          partnership_tier?: string | null
          perry_comments?: string | null
          primary_platforms?: string | null
          primary_source?: string | null
          priority?: string | null
          reach_signal?: string | null
          recent_activity_check?: string | null
          recommended_offer?: string | null
          rena_notes?: string | null
          research_notes?: string | null
          research_status?: string | null
          response_followup?: string | null
          sample_status?: string | null
          segment?: string | null
          seth_next_action?: string | null
          target_audience?: string | null
          technical_notes?: string | null
          tiktok?: string | null
          tuan_affiliate_status?: string | null
          updated_at?: string
          verification_date?: string | null
          verification_evidence?: string | null
          youtube?: string | null
        }
        Update: {
          amazon?: string | null
          amazon_confidence?: string | null
          amazon_content_analysis?: string | null
          amazon_discovery_source?: string | null
          amazon_fit_score?: number | null
          amazon_reviewed_survival_tabs?: boolean | null
          amazon_shoppable_video?: boolean | null
          amazon_storefront_url?: string | null
          amazon_video_url?: string | null
          code?: string | null
          contact_confidence?: string | null
          contact_method?: string | null
          contact_route?: string | null
          contacted_date?: string | null
          created_at?: string
          creator_code?: string | null
          email?: string | null
          facebook?: string | null
          followers_signal?: string | null
          full_verification?: string | null
          geography?: string | null
          geography_confidence?: string | null
          id?: string
          imported_by?: string | null
          instagram?: string | null
          last_researched?: string | null
          monetization?: string | null
          name?: string
          normalized_domain?: string | null
          offer_confidence?: string | null
          offer_reasoning?: string | null
          other_platform?: string | null
          outreach_owner?: string | null
          partnership_tier?: string | null
          perry_comments?: string | null
          primary_platforms?: string | null
          primary_source?: string | null
          priority?: string | null
          reach_signal?: string | null
          recent_activity_check?: string | null
          recommended_offer?: string | null
          rena_notes?: string | null
          research_notes?: string | null
          research_status?: string | null
          response_followup?: string | null
          sample_status?: string | null
          segment?: string | null
          seth_next_action?: string | null
          target_audience?: string | null
          technical_notes?: string | null
          tiktok?: string | null
          tuan_affiliate_status?: string | null
          updated_at?: string
          verification_date?: string | null
          verification_evidence?: string | null
          youtube?: string | null
        }
        Relationships: []
      }
      sales_prospects: {
        Row: {
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          imported_by: string | null
          normalized_domain: string
          notes: string | null
          phone: string | null
          raw_row: Json | null
          source: string | null
          stage: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          imported_by?: string | null
          normalized_domain: string
          notes?: string | null
          phone?: string | null
          raw_row?: Json | null
          source?: string | null
          stage?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          imported_by?: string | null
          normalized_domain?: string
          notes?: string | null
          phone?: string | null
          raw_row?: Json | null
          source?: string | null
          stage?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      team_role_assignments: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_current_team_access: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
    }
    Enums: {
      app_role:
        | "executive"
        | "research_manager"
        | "partnership_manager"
        | "partnership_coordinator"
        | "shopify_content_editor"
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
      app_role: [
        "executive",
        "research_manager",
        "partnership_manager",
        "partnership_coordinator",
        "shopify_content_editor",
      ],
    },
  },
} as const
