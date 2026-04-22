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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      apollo_samples: {
        Row: {
          apollo_response: Json | null
          company_id: string
          credits_spent: number
          detected_domain: string | null
          detected_pattern: string | null
          email_ignored_reason: string | null
          email_returned: string | null
          id: string
          person_first_name: string | null
          person_last_name: string | null
          sampled_at: string
        }
        Insert: {
          apollo_response?: Json | null
          company_id: string
          credits_spent?: number
          detected_domain?: string | null
          detected_pattern?: string | null
          email_ignored_reason?: string | null
          email_returned?: string | null
          id?: string
          person_first_name?: string | null
          person_last_name?: string | null
          sampled_at?: string
        }
        Update: {
          apollo_response?: Json | null
          company_id?: string
          credits_spent?: number
          detected_domain?: string | null
          detected_pattern?: string | null
          email_ignored_reason?: string | null
          email_returned?: string | null
          id?: string
          person_first_name?: string | null
          person_last_name?: string | null
          sampled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apollo_samples_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_secrets: {
        Row: {
          name: string
          value: string
        }
        Insert: {
          name: string
          value: string
        }
        Update: {
          name?: string
          value?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          apollo_credits_spent: number
          created_at: string
          display_name: string
          domain: string | null
          id: string
          last_sampled_at: string | null
          locked_at: string | null
          matching_samples: number
          name_normalized: string
          sample_size: number
          template_confidence: string
          template_pattern: string | null
          updated_at: string
        }
        Insert: {
          apollo_credits_spent?: number
          created_at?: string
          display_name: string
          domain?: string | null
          id?: string
          last_sampled_at?: string | null
          locked_at?: string | null
          matching_samples?: number
          name_normalized: string
          sample_size?: number
          template_confidence?: string
          template_pattern?: string | null
          updated_at?: string
        }
        Update: {
          apollo_credits_spent?: number
          created_at?: string
          display_name?: string
          domain?: string | null
          id?: string
          last_sampled_at?: string | null
          locked_at?: string | null
          matching_samples?: number
          name_normalized?: string
          sample_size?: number
          template_confidence?: string
          template_pattern?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consultants: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auth_user_id: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          display_name: string | null
          email: string
          id: string
          is_admin: boolean
          is_approved: boolean
          last_active_at: string | null
          role: string
          sessions_revoked_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auth_user_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          display_name?: string | null
          email: string
          id?: string
          is_admin?: boolean
          is_approved?: boolean
          last_active_at?: string | null
          role?: string
          sessions_revoked_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auth_user_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_admin?: boolean
          is_approved?: boolean
          last_active_at?: string | null
          role?: string
          sessions_revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultants_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_display: string
          company_id: string
          created_at: string
          email: string | null
          email_source: string | null
          enriched_at: string | null
          enrichment_status: string
          first_name: string
          first_name_normalized: string
          id: string
          last_name: string | null
          last_name_normalized: string | null
          normalized_key: string
          upload_id: string
          uploaded_by: string
        }
        Insert: {
          company_display: string
          company_id: string
          created_at?: string
          email?: string | null
          email_source?: string | null
          enriched_at?: string | null
          enrichment_status?: string
          first_name: string
          first_name_normalized: string
          id?: string
          last_name?: string | null
          last_name_normalized?: string | null
          normalized_key: string
          upload_id: string
          uploaded_by: string
        }
        Update: {
          company_display?: string
          company_id?: string
          created_at?: string
          email?: string | null
          email_source?: string | null
          enriched_at?: string | null
          enrichment_status?: string
          first_name?: string
          first_name_normalized?: string
          id?: string
          last_name?: string | null
          last_name_normalized?: string | null
          normalized_key?: string
          upload_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_upload_fk"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      dedup_archive: {
        Row: {
          archived_at: string
          first_uploaded_by: string | null
          normalized_key: string
          original_company: string | null
          original_first_name: string | null
          original_last_name: string | null
          pulled_in_sheet: string | null
        }
        Insert: {
          archived_at?: string
          first_uploaded_by?: string | null
          normalized_key: string
          original_company?: string | null
          original_first_name?: string | null
          original_last_name?: string | null
          pulled_in_sheet?: string | null
        }
        Update: {
          archived_at?: string
          first_uploaded_by?: string | null
          normalized_key?: string
          original_company?: string | null
          original_first_name?: string | null
          original_last_name?: string | null
          pulled_in_sheet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dedup_archive_first_uploaded_by_fkey"
            columns: ["first_uploaded_by"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedup_archive_sheet_fk"
            columns: ["pulled_in_sheet"]
            isOneToOne: false
            referencedRelation: "sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_jobs: {
        Row: {
          attempts: number
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          company_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sheets: {
        Row: {
          consultant_id: string
          created_at: string
          deleted_at: string | null
          from_own_sourcing: number
          from_shared_pool: number
          google_sheet_id: string | null
          google_sheet_url: string | null
          id: string
          row_count: number
          scheduled_delete_at: string | null
          status: string
        }
        Insert: {
          consultant_id: string
          created_at?: string
          deleted_at?: string | null
          from_own_sourcing?: number
          from_shared_pool?: number
          google_sheet_id?: string | null
          google_sheet_url?: string | null
          id?: string
          row_count: number
          scheduled_delete_at?: string | null
          status?: string
        }
        Update: {
          consultant_id?: string
          created_at?: string
          deleted_at?: string | null
          from_own_sourcing?: number
          from_shared_pool?: number
          google_sheet_id?: string | null
          google_sheet_url?: string | null
          id?: string
          row_count?: number
          scheduled_delete_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheets_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          completed_at: string | null
          consultant_id: string
          error_message: string | null
          filename: string | null
          id: string
          row_count_admitted: number
          row_count_already_in_pool: number
          row_count_archived: number
          row_count_deduped: number
          row_count_raw: number
          row_count_rejected: number
          status: string
          uploaded_at: string
        }
        Insert: {
          completed_at?: string | null
          consultant_id: string
          error_message?: string | null
          filename?: string | null
          id?: string
          row_count_admitted?: number
          row_count_already_in_pool?: number
          row_count_archived?: number
          row_count_deduped?: number
          row_count_raw?: number
          row_count_rejected?: number
          status?: string
          uploaded_at?: string
        }
        Update: {
          completed_at?: string | null
          consultant_id?: string
          error_message?: string | null
          filename?: string | null
          id?: string
          row_count_admitted?: number
          row_count_already_in_pool?: number
          row_count_archived?: number
          row_count_deduped?: number
          row_count_raw?: number
          row_count_rejected?: number
          status?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploads_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      pull_sheet: {
        Args: { p_consultant_id: string; p_max_rows: number }
        Returns: {
          company_display: string
          email: string
          first_name: string
          id: string
          last_name: string
          normalized_key: string
          uploaded_by: string
        }[]
      }
      resolve_consultant: {
        Args: {
          p_auth_user_id: string
          p_display_name: string
          p_email: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          auth_user_id: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          display_name: string | null
          email: string
          id: string
          is_admin: boolean
          is_approved: boolean
          last_active_at: string | null
          role: string
          sessions_revoked_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "consultants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vault_read_secret: { Args: { secret_name: string }; Returns: string }
      vault_write_secret: {
        Args: { secret_name: string; secret_value: string }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
