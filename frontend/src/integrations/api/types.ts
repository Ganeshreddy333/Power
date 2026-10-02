export type PublicSpeakerSession = {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  room: string;
};

export type PublicSpeakerProfile = {
  speaker: Tables<"speakers">;
  sessions: PublicSpeakerSession[];
};

export type AccommodationOption = {
  id: string;
  name: string;
  description: string | null;
  price_per_night: number;
  currency: string;
  available_from: string | null;
  available_until: string | null;
  minimum_nights: number;
  maximum_nights: number | null;
  capacity: number | null;
  allow_outside_conference_dates: boolean;
  is_active: boolean;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      abstract_submissions: {
        Row: {
          abstract_text: string
          abstract_title: string
          affiliation: string
          country: string | null
          created_at: string | null
          drive_url: string | null
          email: string
          file_paths: Json | null
          full_name: string
          id: string
          keywords: string | null
          phone: string | null
          presentation_type: string | null
          status: string
          session: string | null
          supporting_text: string | null
          voice_file_name: string | null
          voice_file_path: string | null
          website_url: string | null
        }
        Insert: {
          abstract_text: string
          abstract_title: string
          affiliation: string
          country?: string | null
          created_at?: string | null
          drive_url?: string | null
          email: string
          file_paths?: Json | null
          full_name: string
          id?: string
          keywords?: string | null
          phone?: string | null
          presentation_type?: string | null
          status?: string
          session?: string | null
          supporting_text?: string | null
          voice_file_name?: string | null
          voice_file_path?: string | null
          website_url?: string | null
        }
        Update: {
          abstract_text?: string
          abstract_title?: string
          affiliation?: string
          country?: string | null
          created_at?: string | null
          drive_url?: string | null
          email?: string
          file_paths?: Json | null
          full_name?: string
          id?: string
          keywords?: string | null
          phone?: string | null
          presentation_type?: string | null
          status?: string
          session?: string | null
          supporting_text?: string | null
          voice_file_name?: string | null
          voice_file_path?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
          status?: string
          subject: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      coupon_codes: {
        Row: {
          code: string
          created_at: string | null
          current_uses: number | null
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      information_blocks: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          cta_label: string | null
          cta_url: string | null
          display_order: number | null
          id: string
          is_visible: boolean | null
          subtitle: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          cta_label?: string | null
          cta_url?: string | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          subtitle?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          cta_label?: string | null
          cta_url?: string | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          subtitle?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      media_partners: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_visible: boolean | null
          logo_url: string | null
          name: string
          tier: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          logo_url?: string | null
          name: string
          tier?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          logo_url?: string | null
          name?: string
          tier?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      registration_intents: {
        Row: {
          accommodation_check_in: string | null
          accommodation_check_out: string | null
          accommodation_option_id: string | null
          affiliation: string | null
          amount_usd: number
          cancelled_at: string | null
          completed_at: string | null
          country: string | null
          created_at: string | null
          currency: string
          designation: string | null
          email: string
          full_name: string
          gateway_response: Json | null
          id: string
          notes: string | null
          payment_order_id: string | null
          payment_provider: string
          payment_reference: string | null
          payment_session_id: string | null
          payment_status: string
          phone: string
          quantity: number
          plan_key: string
          plan_name: string
          redirect_url: string | null
          redirected_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accommodation_check_in?: string | null
          accommodation_check_out?: string | null
          accommodation_option_id?: string | null
          affiliation?: string | null
          amount_usd: number
          cancelled_at?: string | null
          completed_at?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string
          designation?: string | null
          email: string
          full_name: string
          gateway_response?: Json | null
          id?: string
          notes?: string | null
          payment_order_id?: string | null
          payment_provider: string
          payment_reference?: string | null
          payment_session_id?: string | null
          payment_status?: string
          phone: string
          quantity?: number
          plan_key: string
          plan_name: string
          redirect_url?: string | null
          redirected_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accommodation_check_in?: string | null
          accommodation_check_out?: string | null
          accommodation_option_id?: string | null
          affiliation?: string | null
          amount_usd?: number
          cancelled_at?: string | null
          completed_at?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string
          designation?: string | null
          email?: string
          full_name?: string
          gateway_response?: Json | null
          id?: string
          notes?: string | null
          payment_order_id?: string | null
          payment_provider?: string
          payment_reference?: string | null
          payment_session_id?: string | null
          payment_status?: string
          phone?: string
          quantity?: number
          plan_key?: string
          plan_name?: string
          redirect_url?: string | null
          redirected_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      accommodation_options: {
        Row: AccommodationOption & {
          created_at: string
          updated_at: string
        }
        Insert: {
          allow_outside_conference_dates?: boolean
          available_from?: string | null
          available_until?: string | null
          capacity?: number | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          maximum_nights?: number | null
          minimum_nights?: number
          name: string
          price_per_night: number
        }
        Update: Partial<Database["public"]["Tables"]["accommodation_options"]["Insert"]>
        Relationships: []
      }
      site_data: {
        Row: {
          created_at: string | null
          data_key: string
          group_name: string | null
          id: string
          is_public: boolean | null
          label: string
          updated_at: string | null
          value: string | null
          value_type: string | null
        }
        Insert: {
          created_at?: string | null
          data_key: string
          group_name?: string | null
          id?: string
          is_public?: boolean | null
          label: string
          updated_at?: string | null
          value?: string | null
          value_type?: string | null
        }
        Update: {
          created_at?: string | null
          data_key?: string
          group_name?: string | null
          id?: string
          is_public?: boolean | null
          label?: string
          updated_at?: string | null
          value?: string | null
          value_type?: string | null
        }
        Relationships: []
      }
      speakers: {
        Row: {
          bio: string | null
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_visible: boolean | null
          linkedin_url: string | null
          name: string
          organization: string | null
          session_type: string | null
          title: string | null
          topic: string | null
          twitter_url: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_visible?: boolean | null
          linkedin_url?: string | null
          name: string
          organization?: string | null
          session_type?: string | null
          title?: string | null
          topic?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_visible?: boolean | null
          linkedin_url?: string | null
          name?: string
          organization?: string | null
          session_type?: string | null
          title?: string | null
          topic?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          website_url?: string | null
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
      website_content: {
        Row: {
          content: string | null
          id: string
          metadata: Json | null
          section_key: string
          title: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          content?: string | null
          id?: string
          metadata?: Json | null
          section_key: string
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content?: string | null
          id?: string
          metadata?: Json | null
          section_key?: string
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
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
      update_registration_payment: {
        Args: {
          p_gateway_response?: Json
          p_payment_order_id?: string
          p_payment_reference?: string
          p_payment_session_id?: string
          p_payment_status: string
          p_registration_id: string
        }
        Returns: {
          affiliation: string | null
          amount_usd: number
          cancelled_at: string | null
          completed_at: string | null
          country: string | null
          created_at: string | null
          currency: string
          designation: string | null
          email: string
          full_name: string
          gateway_response: Json | null
          id: string
          notes: string | null
          payment_order_id: string | null
          payment_provider: string
          payment_reference: string | null
          payment_session_id: string | null
          payment_status: string
          phone: string
          plan_key: string
          plan_name: string
          redirect_url: string | null
          redirected_at: string | null
          status: string
          updated_at: string
        }
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

type DatabaseWithoutInternals = Database;
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
