import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");

    if (!supabaseUrl || !publishableKey || !serviceRoleKey || !authorization) {
      throw new Error("Function environment or authorization is incomplete.");
    }

    const callerClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return json({ error: "Authentication required." }, 401);
    }

    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const roleCode = String(body.role_code ?? "").trim();
    const businessId = String(body.business_id ?? "").trim();

    if (!email || !roleCode || !businessId) {
      return json({ error: "email, role_code, and business_id are required." }, 400);
    }

    const { data: permitted, error: permissionError } = await callerClient.rpc(
      "has_permission",
      {
        requested_permission: "users.manage",
        requested_business_id: businessId,
      },
    );

    if (permissionError || permitted !== true) {
      return json({ error: "Admin permission is required." }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: role, error: roleError } = await adminClient
      .from("roles")
      .select("id, code")
      .eq("code", roleCode)
      .single();

    if (roleError || !role) {
      return json({ error: "Unknown role." }, 400);
    }

    const redirectTo =
      Deno.env.get("AUTH_REDIRECT_URL") ?? "https://oms.tastory4u.com";

    const { data: invite, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: fullName },
      });

    if (inviteError || !invite.user) {
      return json({ error: inviteError?.message ?? "Unable to invite user." }, 400);
    }

    const { error: profileError } = await adminClient.from("users").upsert({
      id: invite.user.id,
      email,
      full_name: fullName || email.split("@")[0],
      is_active: true,
    });

    if (profileError) {
      return json(
        {
          error: "User was invited, but profile creation failed.",
          details: profileError.message,
        },
        500,
      );
    }

    const { error: roleAssignmentError } = await adminClient
      .from("user_roles")
      .upsert({
        business_id: businessId,
        user_id: invite.user.id,
        role_id: role.id,
        assigned_by: caller.id,
      });

    if (roleAssignmentError) {
      return json(
        {
          error: "User was invited, but role assignment failed.",
          details: roleAssignmentError.message,
        },
        500,
      );
    }

    return json({
      user_id: invite.user.id,
      email,
      role: role.code,
      invited: true,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500,
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
