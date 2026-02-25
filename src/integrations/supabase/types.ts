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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      email_metadata: {
        Row: {
          deleted: boolean
          has_unsubscribe: boolean
          id: string
          is_read: boolean
          message_id: string
          received_at: string | null
          scan_id: string
          sender: string
          size_bytes: number
          subject: string | null
          unsubscribe_link: string | null
          user_id: string
        }
        Insert: {
          deleted?: boolean
          has_unsubscribe?: boolean
          id?: string
          is_read?: boolean
          message_id: string
          received_at?: string | null
          scan_id: string
          sender: string
          size_bytes?: number
          subject?: string | null
          unsubscribe_link?: string | null
          user_id: string
        }
        Update: {
          deleted?: boolean
          has_unsubscribe?: boolean
          id?: string
          is_read?: boolean
          message_id?: string
          received_at?: string | null
          scan_id?: string
          sender?: string
          size_bytes?: number
          subject?: string | null
          unsubscribe_link?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_metadata_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scan_history"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_history: {
        Row: {
          completed_at: string | null
          deletable_emails: number
          deletable_senders: number
          id: string
          mails_deleted: number
          senders_deleted: number
          space_recoverable: number
          space_recovered: number
          space_scanned: number
          started_at: string
          status: string
          total_emails: number
          total_senders: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          deletable_emails?: number
          deletable_senders?: number
          id?: string
          mails_deleted?: number
          senders_deleted?: number
          space_recoverable?: number
          space_recovered?: number
          space_scanned?: number
          started_at?: string
          status?: string
          total_emails?: number
          total_senders?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          deletable_emails?: number
          deletable_senders?: number
          id?: string
          mails_deleted?: number
          senders_deleted?: number
          space_recoverable?: number
          space_recovered?: number
          space_scanned?: number
          started_at?: string
          status?: string
          total_emails?: number
          total_senders?: number
          user_id?: string
        }
        Relationships: []
      }
      sender_summary: {
        Row: {
          has_unsubscribe: boolean
          id: string
          purge_action: string
          scan_id: string
          sender: string
          total_emails: number
          total_size: number
          unopened_count: number
          unopened_pct: number
          unsubscribe_requested: boolean
          user_id: string
        }
        Insert: {
          has_unsubscribe?: boolean
          id?: string
          purge_action?: string
          scan_id: string
          sender: string
          total_emails?: number
          total_size?: number
          unopened_count?: number
          unopened_pct?: number
          unsubscribe_requested?: boolean
          user_id: string
        }
        Update: {
          has_unsubscribe?: boolean
          id?: string
          purge_action?: string
          scan_id?: string
          sender?: string
          total_emails?: number
          total_size?: number
          unopened_count?: number
          unopened_pct?: number
          unsubscribe_requested?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sender_summary_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scan_history"
            referencedColumns: ["id"]
          },
        ]
      }
      user_oauth_tokens: {
        Row: {
          access_token: string | null
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
