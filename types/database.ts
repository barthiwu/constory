// Hand-written mirror of the Supabase schema in supabase/migrations/.
// Regenerate with `supabase gen types typescript` once the project is linked,
// and reconcile any drift with this file.

export type Role = "owner" | "admin" | "editor" | "viewer";
export type StrategySource = "AI" | "USER" | "AI_EDITED";
export type IdeaSource = "AI" | "USER";
export type IdeaStatus = "active" | "used" | "archived";
export type PostStatus = "draft" | "planned" | "completed";
export type GenerationType =
  | "strategy"
  | "pillars"
  | "ideas"
  | "calendar"
  | "post"
  | "caption"
  | "regeneration";
export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Workspace = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  industry: string | null;
  website: string | null;
  primary_market: string | null;
  onboarding_step: number;
  onboarding_completed: boolean;
  /** Set by a plan downgrade that no longer covers every workspace this owner has — see lib/billing. */
  billing_locked: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  created_at: string;
};

/** A role an invite/membership write can target — never 'owner' (no ownership-transfer feature in V1). */
export type InviteRole = Exclude<Role, "owner">;

export type WorkspaceInviteStatus = "pending" | "accepted" | "revoked";

export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string;
  role: InviteRole;
  invited_by: string;
  token: string;
  status: WorkspaceInviteStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type BrandProfile = {
  id: string;
  workspace_id: string;
  business_description: string;
  target_audience: string;
  audience_type: string | null;
  audience_locations: string | null;
  audience_age_range: string | null;
  audience_interests: string | null;
  audience_problems: string | null;
  brand_voice: string;
  brand_voice_traits: string[];
  primary_goal: string | null;
  secondary_goals: string[];
  selected_platforms: string[];
  created_at: string;
  updated_at: string;
};

export type ProductService = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentMixItem = {
  pillar: string;
  percentage: number;
};

export type ContentStrategy = {
  id: string;
  workspace_id: string;
  strategy_summary: string;
  monthly_theme: string | null;
  content_mix: ContentMixItem[];
  source: StrategySource;
  created_at: string;
  updated_at: string;
};

export type ContentPillar = {
  id: string;
  strategy_id: string;
  workspace_id: string;
  name: string;
  description: string;
  recommended_percentage: number;
  source: StrategySource;
  created_at: string;
  updated_at: string;
};

export type ContentCalendar = {
  id: string;
  workspace_id: string;
  name: string;
  start_date: string;
  end_date: string;
  posting_frequency: number;
  selected_platforms: string[];
  primary_goal: string | null;
  campaign_name: string | null;
  campaign_objective: string | null;
  campaign_start_date: string | null;
  campaign_end_date: string | null;
  campaign_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarPost = {
  id: string;
  calendar_id: string;
  content_pillar_id: string | null;
  scheduled_date: string;
  platform: string;
  title: string;
  format: string | null;
  objective: string | null;
  brief: string | null;
  hook: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string[];
  creative_direction: string | null;
  status: PostStatus;
  created_at: string;
  updated_at: string;
};

export type ContentIdea = {
  id: string;
  workspace_id: string;
  content_pillar_id: string | null;
  title: string;
  description: string;
  source: IdeaSource;
  status: IdeaStatus;
  recommended_platforms: string[];
  recommended_format: string | null;
  content_objective: string | null;
  suggested_hook: string | null;
  created_at: string;
  updated_at: string;
};

export type AiGeneration = {
  id: string;
  workspace_id: string;
  user_id: string;
  generation_type: GenerationType;
  input_summary: Record<string, unknown> | null;
  output_summary: Record<string, unknown> | null;
  status: GenerationStatus;
  error_message: string | null;
  created_at: string;
};

// =============================================================================
// Phase 7.5 — billing, subscriptions, AI credits
// =============================================================================

export type PlanId = "free" | "creator" | "pro";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "expired";
export type BillingInterval = "monthly" | "quarterly" | "annual";
export type BillingProviderName = "none" | "manual" | "paystack" | "stripe";
export type AIActionType =
  | "generate_post"
  | "regenerate_post"
  | "improve_content"
  | "generate_ideas"
  | "generate_strategy"
  | "generate_calendar";
export type UsageRequestStatus = "success" | "failed";

export type Subscription = {
  id: string;
  owner_id: string;
  plan_id: PlanId;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  /** Plan the account will move to when current_period_end is reached (a scheduled downgrade, including "Cancel" -> free). Null when nothing is scheduled. */
  pending_plan_id: PlanId | null;
  pending_billing_interval: BillingInterval | null;
  provider: BillingProviderName;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  /** Paystack's subscription `email_token` — required alongside provider_subscription_id to call /subscription/disable or /subscription/enable. Not readable by a regular authenticated session (migration 0020's SELECT column lockdown) — a payment-capable secret, not just an id. */
  provider_subscription_token: string | null;
  /** The reusable card token from the account's original Paystack payment, used to auto-bill a scheduled downgrade's new plan at renewal with no new checkout (see getResolvedSubscription in services/billing-service.ts). Same SELECT lockdown as provider_subscription_token. */
  provider_authorization_code: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditBalance = {
  id: string;
  owner_id: string;
  period_start: string;
  period_end: string;
  monthly_allocation: number;
  credits_used: number;
  created_at: string;
  updated_at: string;
};

export type AiUsageLedgerRow = {
  id: string;
  owner_id: string;
  workspace_id: string | null;
  user_id: string | null;
  action_type: AIActionType;
  credits_used: number;
  request_status: UsageRequestStatus;
  created_at: string;
};

export type ConsumeAiCreditsResult = {
  ok: boolean;
  remaining: number;
  monthly_allocation: number;
  reason: string;
};

export type BillingEventStatus = "processed" | "ignored" | "error";

export type BillingEvent = {
  id: string;
  provider: "paystack" | "stripe";
  provider_event_id: string;
  event_type: string;
  owner_id: string | null;
  status: BillingEventStatus;
  detail: string | null;
  created_at: string;
};

// =============================================================================
// Notifications — in-app feed + per-user email/in-app preferences (see
// supabase/migrations/0023_notifications.sql).
// =============================================================================

export type NotificationType = "low_credits" | "scheduled_post_reminder" | "weekly_digest";

export type Notification = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreferences = {
  user_id: string;
  email_low_credits: boolean;
  email_scheduled_posts: boolean;
  email_weekly_digest: boolean;
  inapp_low_credits: boolean;
  inapp_scheduled_posts: boolean;
  inapp_weekly_digest: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationLog = {
  id: string;
  event_key: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      workspaces: {
        Row: Workspace;
        Insert: Partial<Workspace> & { owner_id: string; name: string };
        Update: Partial<Workspace>;
        Relationships: [];
      };
      workspace_members: {
        Row: WorkspaceMember;
        Insert: Partial<WorkspaceMember> & { workspace_id: string; user_id: string };
        Update: Partial<WorkspaceMember>;
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_invites: {
        Row: WorkspaceInvite;
        Insert: Partial<WorkspaceInvite> & { workspace_id: string; email: string; role: InviteRole; invited_by: string };
        Update: Partial<WorkspaceInvite>;
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      brand_profiles: {
        Row: BrandProfile;
        Insert: Partial<BrandProfile> & { workspace_id: string };
        Update: Partial<BrandProfile>;
        Relationships: [];
      };
      products_services: {
        Row: ProductService;
        Insert: Partial<ProductService> & { workspace_id: string; name: string };
        Update: Partial<ProductService>;
        Relationships: [];
      };
      content_strategies: {
        Row: ContentStrategy;
        Insert: Partial<ContentStrategy> & { workspace_id: string };
        Update: Partial<ContentStrategy>;
        Relationships: [];
      };
      content_pillars: {
        Row: ContentPillar;
        Insert: Partial<ContentPillar> & { strategy_id: string; workspace_id: string; name: string };
        Update: Partial<ContentPillar>;
        Relationships: [];
      };
      content_calendars: {
        Row: ContentCalendar;
        Insert: Partial<ContentCalendar> & {
          workspace_id: string;
          name: string;
          start_date: string;
          end_date: string;
        };
        Update: Partial<ContentCalendar>;
        Relationships: [];
      };
      calendar_posts: {
        Row: CalendarPost;
        Insert: Partial<CalendarPost> & { calendar_id: string; scheduled_date: string; platform: string };
        Update: Partial<CalendarPost>;
        Relationships: [
          {
            foreignKeyName: "calendar_posts_calendar_id_fkey";
            columns: ["calendar_id"];
            isOneToOne: false;
            referencedRelation: "content_calendars";
            referencedColumns: ["id"];
          },
        ];
      };
      content_ideas: {
        Row: ContentIdea;
        Insert: Partial<ContentIdea> & { workspace_id: string; title: string };
        Update: Partial<ContentIdea>;
        Relationships: [];
      };
      ai_generations: {
        Row: AiGeneration;
        Insert: Partial<AiGeneration> & { workspace_id: string; user_id: string; generation_type: GenerationType };
        Update: Partial<AiGeneration>;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription> & { owner_id: string };
        Update: Partial<Subscription>;
        Relationships: [];
      };
      credit_balances: {
        Row: CreditBalance;
        Insert: Partial<CreditBalance> & { owner_id: string };
        Update: Partial<CreditBalance>;
        Relationships: [];
      };
      ai_usage_ledger: {
        Row: AiUsageLedgerRow;
        Insert: Partial<AiUsageLedgerRow> & { owner_id: string; action_type: AIActionType; credits_used: number };
        Update: Partial<AiUsageLedgerRow>;
        Relationships: [];
      };
      billing_events: {
        Row: BillingEvent;
        Insert: Partial<BillingEvent> & { provider_event_id: string; event_type: string };
        Update: Partial<BillingEvent>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: Partial<NotificationPreferences> & { user_id: string };
        Update: Partial<NotificationPreferences>;
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: Notification;
        Insert: Partial<Notification> & { user_id: string; type: NotificationType; title: string; body: string };
        Update: Partial<Notification>;
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_log: {
        Row: NotificationLog;
        Insert: Partial<NotificationLog> & { event_key: string };
        Update: Partial<NotificationLog>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_workspace_admin: {
        Args: {
          target_workspace_id: string;
        };
        Returns: boolean;
      };
      get_invite_preview: {
        Args: {
          p_token: string;
        };
        Returns: {
          workspace_id: string;
          workspace_name: string;
          role: InviteRole;
          invited_email: string;
          inviter_name: string | null;
          status: WorkspaceInviteStatus;
          expired: boolean;
        }[];
      };
      accept_workspace_invite: {
        Args: {
          p_token: string;
        };
        Returns: {
          ok: boolean;
          reason: string;
          workspace_id: string | null;
        }[];
      };
      consume_ai_credits: {
        Args: {
          p_workspace_id: string;
          p_action_type: AIActionType | null;
          p_credits: number;
        };
        Returns: ConsumeAiCreditsResult[];
      };
      apply_plan_change: {
        Args: {
          p_owner_id: string;
          p_plan_id: PlanId;
          p_status: SubscriptionStatus;
          p_billing_interval: BillingInterval;
          p_period_start: string;
          p_period_end: string;
          p_cancel_at_period_end: boolean;
          p_credit_allocation: number;
        };
        Returns: undefined;
      };
      get_credit_balance: {
        Args: {
          p_owner_id: string;
        };
        Returns: CreditBalance | null;
      };
      set_subscription_pending_change: {
        Args: {
          p_owner_id: string;
          p_cancel_at_period_end: boolean;
          p_pending_plan_id: PlanId | null;
          p_pending_billing_interval: BillingInterval | null;
        };
        Returns: undefined;
      };
      resolve_scheduled_plan_change: {
        Args: {
          p_owner_id: string;
          p_plan_id: PlanId;
          p_billing_interval: BillingInterval;
          p_period_start: string;
          p_period_end: string;
          p_credit_allocation: number;
          p_provider_subscription_id?: string | null;
          p_provider_subscription_token?: string | null;
        };
        Returns: undefined;
      };
      mark_subscription_past_due: {
        Args: {
          p_owner_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
