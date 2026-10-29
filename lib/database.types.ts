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
      admins: {
        Row: {
          can_adjust_stock: boolean
          can_give_discounts: boolean
          created_at: string
          display_name: string | null
          is_active: boolean
          role: string
          user_id: string
        }
        Insert: {
          can_adjust_stock?: boolean
          can_give_discounts?: boolean
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          role?: string
          user_id: string
        }
        Update: {
          can_adjust_stock?: boolean
          can_give_discounts?: boolean
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          alt: string
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          public_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          alt: string
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          public_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          alt?: string
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          public_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["category_id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          line_total: number
          option_values: string | null
          order_id: string
          product_name: string
          qty: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          line_total: number
          option_values?: string | null
          order_id: string
          product_name: string
          qty: number
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          line_total?: number
          option_values?: string | null
          order_id?: string
          product_name?: string
          qty?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_name: string
          id: string
          items_total: number
          location: string | null
          notes: string | null
          order_code: string
          phone: string
          public_token: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          id?: string
          items_total: number
          location?: string | null
          notes?: string | null
          order_code?: string
          phone: string
          public_token?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          id?: string
          items_total?: number
          location?: string | null
          notes?: string | null
          order_code?: string
          phone?: string
          public_token?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          category_id: string
          product_id: string
        }
        Insert: {
          category_id: string
          product_id: string
        }
        Update: {
          category_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string
          id: string
          product_id: string
          public_id: string | null
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string
          id?: string
          product_id: string
          public_id?: string | null
          sort_order?: number
          url: string
        }
        Update: {
          alt?: string
          id?: string
          product_id?: string
          public_id?: string | null
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          id: string
          in_stock: boolean
          option1_value: string | null
          option2_value: string | null
          price_override: number | null
          product_id: string
          reorder_level: number
          sku: string | null
          stock_qty: number | null
        }
        Insert: {
          barcode?: string | null
          id?: string
          in_stock?: boolean
          option1_value?: string | null
          option2_value?: string | null
          price_override?: number | null
          product_id: string
          reorder_level?: number
          sku?: string | null
          stock_qty?: number | null
        }
        Update: {
          barcode?: string | null
          id?: string
          in_stock?: boolean
          option1_value?: string | null
          option2_value?: string | null
          price_override?: number | null
          product_id?: string
          reorder_level?: number
          sku?: string | null
          stock_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          compare_at_price: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          option1_name: string | null
          option2_name: string | null
          price: number
          search_vector: unknown
          slug: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          option1_name?: string | null
          option2_name?: string | null
          price: number
          search_vector?: unknown
          slug: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          option1_name?: string | null
          option2_name?: string | null
          price?: number
          search_vector?: unknown
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          announcement: string | null
          contact_email: string | null
          id: number
          opening_hours: string | null
          reply_close: string | null
          reply_days: number[]
          reply_open: string | null
          response_promise: string | null
          shop_address: string | null
          social_links: Json
          store_name: string
          tagline: string | null
          whatsapp_number: string
        }
        Insert: {
          announcement?: string | null
          contact_email?: string | null
          id?: number
          opening_hours?: string | null
          reply_close?: string | null
          reply_days?: number[]
          reply_open?: string | null
          response_promise?: string | null
          shop_address?: string | null
          social_links?: Json
          store_name?: string
          tagline?: string | null
          whatsapp_number: string
        }
        Update: {
          announcement?: string | null
          contact_email?: string | null
          id?: number
          opening_hours?: string | null
          reply_close?: string | null
          reply_days?: number[]
          reply_open?: string | null
          response_promise?: string | null
          shop_address?: string | null
          social_links?: Json
          store_name?: string
          tagline?: string | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      stock_count_lines: {
        Row: {
          count_id: string
          counted: number
          counted_at: string
          counted_by: string | null
          expected: number
          variant_id: string
        }
        Insert: {
          count_id: string
          counted: number
          counted_at?: string
          counted_by?: string | null
          expected: number
          variant_id: string
        }
        Update: {
          count_id?: string
          counted?: number
          counted_at?: string
          counted_by?: string | null
          expected?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_count_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          created_at: string
          created_by: string | null
          finished_at: string | null
          finished_by: string | null
          id: string
          note: string | null
          status: Database["public"]["Enums"]["stock_count_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          finished_by?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["stock_count_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          finished_by?: string | null
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["stock_count_status"]
        }
        Relationships: []
      }
      stock_levels: {
        Row: {
          on_hand: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          on_hand?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          on_hand?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          balance_after: number
          count_id: string | null
          created_at: string
          created_by: string | null
          id: number
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          qty_change: number
          reason: string | null
          variant_id: string
        }
        Insert: {
          balance_after: number
          count_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          qty_change: number
          reason?: string | null
          variant_id: string
        }
        Update: {
          balance_after?: number
          count_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["stock_movement_kind"]
          qty_change?: number
          reason?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_costs: {
        Row: {
          cost_price: number
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        Insert: {
          cost_price: number
          updated_at?: string
          updated_by?: string | null
          variant_id: string
        }
        Update: {
          cost_price?: number
          updated_at?: string
          updated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_costs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "pos_stock_rows"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "variant_costs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pos_stock_rows: {
        Row: {
          barcode: string | null
          category_id: string | null
          category_name: string | null
          image_url: string | null
          on_hand: number | null
          on_website: boolean | null
          option_label: string | null
          price: number | null
          product_id: string | null
          product_name: string | null
          reorder_level: number | null
          sku: string | null
          state_rank: number | null
          stock_state: string | null
          top_category_id: string | null
          top_category_name: string | null
          updated_at: string | null
          variant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_order:
        | {
            Args: {
              p_customer_name: string
              p_items: Json
              p_location: string
              p_notes: string
              p_phone: string
            }
            Returns: {
              order_code: string
              public_token: string
            }[]
          }
        | {
            Args: {
              p_customer_name: string
              p_items: Json
              p_notes: string
              p_phone: string
            }
            Returns: {
              order_code: string
              public_token: string
            }[]
          }
      expire_unsent_orders: { Args: never; Returns: number }
      pos_adjust_stock: {
        Args: { p_change: number; p_reason: string; p_variant_id: string }
        Returns: number
      }
      pos_cancel_count: { Args: { p_count_id: string }; Returns: undefined }
      pos_finish_count: { Args: { p_count_id: string }; Returns: number }
      pos_list_users: {
        Args: never
        Returns: {
          can_adjust_stock: boolean
          can_give_discounts: boolean
          created_at: string
          display_name: string
          email: string
          is_active: boolean
          last_sign_in_at: string
          role: string
          user_id: string
        }[]
      }
      pos_people: {
        Args: never
        Returns: {
          display_name: string
          is_active: boolean
          role: string
          user_id: string
        }[]
      }
      pos_recount: {
        Args: { p_counted: number; p_reason?: string; p_variant_id: string }
        Returns: number
      }
      pos_save_count_line: {
        Args: { p_count_id: string; p_counted: number; p_variant_id: string }
        Returns: undefined
      }
      pos_save_product: { Args: { p: Json }; Returns: string }
      pos_start_count: { Args: { p_note?: string }; Returns: string }
      pos_stock_summary: { Args: never; Returns: Json }
      pos_update_user: {
        Args: {
          p_can_adjust_stock: boolean
          p_can_give_discounts: boolean
          p_display_name: string
          p_is_active: boolean
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      order_status:
        | "awaiting_whatsapp"
        | "confirmed"
        | "paid"
        | "dispatched"
        | "delivered"
        | "cancelled"
        | "not_sent"
      stock_count_status: "open" | "finished" | "cancelled"
      stock_movement_kind:
        | "opening"
        | "sale"
        | "sale_void"
        | "purchase"
        | "purchase_void"
        | "return"
        | "adjustment"
        | "count"
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
      order_status: [
        "awaiting_whatsapp",
        "confirmed",
        "paid",
        "dispatched",
        "delivered",
        "cancelled",
        "not_sent",
      ],
      stock_count_status: ["open", "finished", "cancelled"],
      stock_movement_kind: [
        "opening",
        "sale",
        "sale_void",
        "purchase",
        "purchase_void",
        "return",
        "adjustment",
        "count",
      ],
    },
  },
} as const
