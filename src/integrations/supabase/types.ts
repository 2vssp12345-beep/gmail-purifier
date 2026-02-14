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
          created_at: string
          email_id: string
          has_unsubscribe_link: boolean
          id: string
          is_opened: boolean
          received_date: string | null
          scan_id: string
          sender_email: string
          sender_name: string | null
          size_bytes: number
          subject: string | null
          unsubscribe_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email_id: string
          has_unsubscribe_link?: boolean
          id?: string
          is_opened?: boolean
          received_date?: string | null
          scan_id: string
          sender_email: string
          sender_name?: string | null
          size_bytes?: number
          subject?: string | null
          unsubscribe_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email_id?: string
          has_unsubscribe_link?: boolean
          id?: string
          is_opened?: boolean
          received_date?: string | null
          scan_id?: string
          sender_email?: string
          sender_name?: string | null
          size_bytes?: number
          subject?: string | null
          unsubscribe_url?: string | null
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
          created_at: string
          deletable_mails: number
          deletable_senders: number
          id: string
          mails_deleted: number
          progress: number
          progress_message: string | null
          recoverable_space: number
          senders_deleted: number
          space_recovered: number
          started_at: string
          status: string
          total_emails_scanned: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deletable_mails?: number
          deletable_senders?: number
          id?: string
          mails_deleted?: number
          progress?: number
          progress_message?: string | null
          recoverable_space?: number
          senders_deleted?: number
          space_recovered?: number
          started_at?: string
          status?: string
          total_emails_scanned?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deletable_mails?: number
          deletable_senders?: number
          id?: string
          mails_deleted?: number
          progress?: number
          progress_message?: string | null
          recoverable_space?: number
          senders_deleted?: number
          space_recovered?: number
          started_at?: string
          status?: string
          total_emails_scanned?: number
          user_id?: string
        }
        Relationships: []
      }
      sender_summary: {
        Row: {
          created_at: string
          has_unsubscribe_link: boolean
          id: string
          scan_id: string
          sender_email: string
          sender_name: string | null
          total_emails: number
          total_size_bytes: number
          unopened_count: number
          unopened_percentage: number
          user_id: string
        }
        Insert: {
          created_at?: string
          has_unsubscribe_link?: boolean
          id?: string
          scan_id: string
          sender_email: string
          sender_name?: string | null
          total_emails?: number
          total_size_bytes?: number
          unopened_count?: number
          unopened_percentage?: number
          user_id: string
        }
        Update: {
          created_at?: string
          has_unsubscribe_link?: boolean
          id?: string
          scan_id?: string
          sender_email?: string
          sender_name?: string | null
          total_emails?: number
          total_size_bytes?: number
          unopened_count?: number
          unopened_percentage?: number
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
