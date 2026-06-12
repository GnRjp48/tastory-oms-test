import { createClient } from "npm:@supabase/supabase-js@2";

const supportedRoles = [
  "admin",
  "manager",
  "sales_staff",
  "production_staff",
];

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
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return json({ error: "Authentication required." }, 401);
    }

    const body = await request.json();
    const action = String(body.action ?? "invite").trim().toLowerCase();
    const businessId = String(body.business_id ?? "").trim();

    if (!businessId) {
      return json({ error: "business_id is required." }, 400);
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

    if (action === "invite") {
      return await inviteStaff(adminClient, caller.id, businessId, body);
    }
    if (action === "resend") {
      return await resendInvitation(adminClient, caller.id, businessId, body);
    }
    if (action === "cancel") {
      return await cancelInvitation(adminClient, caller.id, businessId, body);
    }

    return json({ error: "Unsupported invitation action." }, 400);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    if (message.toLowerCase().includes("email rate limit")) {
      return json(
        {
          error:
            "Supabase has temporarily reached its invitation email limit. Wait before retrying or configure custom SMTP.",
        },
        429,
      );
    }
    return json(
      { error: message },
      500,
    );
  }
});

async function inviteStaff(
  adminClient: ReturnType<typeof createClient>,
  callerId: string,
  businessId: string,
  body: Record<string, unknown>,
) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const roleCode = String(body.role_code ?? "").trim();

  if (!email || !fullName || !supportedRoles.includes(roleCode)) {
    return json(
      { error: "A valid full name, email, and supported role are required." },
      400,
    );
  }

  const { data: existingMembership } = await adminClient
    .from("users")
    .select("id,user_roles!inner(business_id)")
    .eq("email", email)
    .eq("user_roles.business_id", businessId)
    .maybeSingle();

  if (existingMembership) {
    return json({ error: "This email is already a Tastory staff member." }, 409);
  }

  const { data: pendingInvitation } = await adminClient
    .from("staff_invitations")
    .select("id")
    .eq("business_id", businessId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingInvitation) {
    return json(
      { error: "A pending invitation already exists for this email." },
      409,
    );
  }

  const role = await findRole(adminClient, roleCode);
  const invite = await sendInvitation(adminClient, email, fullName);
  const assignmentError = await assignInvitedUser(
    adminClient,
    invite.user.id,
    email,
    fullName,
    businessId,
    role.id,
    callerId,
  );

  if (assignmentError) {
    await adminClient.auth.admin.deleteUser(invite.user.id);
    return json({ error: assignmentError }, 500);
  }

  const { data: invitation, error: ledgerError } = await adminClient
    .from("staff_invitations")
    .insert({
      business_id: businessId,
      user_id: invite.user.id,
      email,
      full_name: fullName,
      role_id: role.id,
      status: "pending",
      invited_by: callerId,
    })
    .select("id,invited_at")
    .single();

  if (ledgerError) {
    await adminClient.auth.admin.deleteUser(invite.user.id);
    return json(
      { error: "Invitation was sent, but invitation tracking failed." },
      500,
    );
  }

  return json({
    invitation_id: invitation.id,
    user_id: invite.user.id,
    email,
    role: role.code,
    invited_at: invitation.invited_at,
    status: "pending",
  });
}

async function resendInvitation(
  adminClient: ReturnType<typeof createClient>,
  callerId: string,
  businessId: string,
  body: Record<string, unknown>,
) {
  const invitationId = String(body.invitation_id ?? "").trim();
  if (!invitationId) return json({ error: "invitation_id is required." }, 400);

  const invitation = await findPendingInvitation(
    adminClient,
    invitationId,
    businessId,
  );
  const authUser = invitation.user_id
    ? await adminClient.auth.admin.getUserById(invitation.user_id)
    : null;

  if (
    authUser?.data.user?.email_confirmed_at ||
    authUser?.data.user?.last_sign_in_at
  ) {
    return json({ error: "Accepted invitations cannot be resent." }, 409);
  }

  if (invitation.user_id) {
    await adminClient.auth.admin.deleteUser(invitation.user_id);
  }

  const invite = await sendInvitation(
    adminClient,
    invitation.email,
    invitation.full_name,
  );
  const assignmentError = await assignInvitedUser(
    adminClient,
    invite.user.id,
    invitation.email,
    invitation.full_name,
    businessId,
    invitation.role_id,
    callerId,
  );
  if (assignmentError) {
    await adminClient.auth.admin.deleteUser(invite.user.id);
    return json({ error: assignmentError }, 500);
  }

  const { error: updateError } = await adminClient
    .from("staff_invitations")
    .update({
      user_id: invite.user.id,
      last_sent_at: new Date().toISOString(),
      send_count: invitation.send_count + 1,
      invited_by: callerId,
    })
    .eq("id", invitation.id);

  if (updateError) {
    return json({ error: "Invitation resent, but tracking update failed." }, 500);
  }

  return json({
    invitation_id: invitation.id,
    user_id: invite.user.id,
    email: invitation.email,
    status: "pending",
    resent: true,
  });
}

async function cancelInvitation(
  adminClient: ReturnType<typeof createClient>,
  callerId: string,
  businessId: string,
  body: Record<string, unknown>,
) {
  const invitationId = String(body.invitation_id ?? "").trim();
  if (!invitationId) return json({ error: "invitation_id is required." }, 400);

  const invitation = await findPendingInvitation(
    adminClient,
    invitationId,
    businessId,
  );
  const authUser = invitation.user_id
    ? await adminClient.auth.admin.getUserById(invitation.user_id)
    : null;

  if (
    authUser?.data.user?.email_confirmed_at ||
    authUser?.data.user?.last_sign_in_at
  ) {
    return json({ error: "Accepted invitations cannot be cancelled." }, 409);
  }

  const { error: updateError } = await adminClient
    .from("staff_invitations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: callerId,
    })
    .eq("id", invitation.id);

  if (updateError) {
    return json({ error: "Unable to cancel invitation." }, 500);
  }

  if (invitation.user_id) {
    await adminClient.auth.admin.deleteUser(invitation.user_id);
  }

  return json({
    invitation_id: invitation.id,
    email: invitation.email,
    status: "cancelled",
  });
}

async function findRole(
  adminClient: ReturnType<typeof createClient>,
  roleCode: string,
) {
  const { data, error } = await adminClient
    .from("roles")
    .select("id,code")
    .eq("code", roleCode)
    .single();
  if (error || !data) throw new Error("Unknown role.");
  return data;
}

async function findPendingInvitation(
  adminClient: ReturnType<typeof createClient>,
  invitationId: string,
  businessId: string,
) {
  const { data, error } = await adminClient
    .from("staff_invitations")
    .select("id,user_id,email,full_name,role_id,status,send_count")
    .eq("id", invitationId)
    .eq("business_id", businessId)
    .eq("status", "pending")
    .single();
  if (error || !data) throw new Error("Pending invitation not found.");
  return data;
}

async function sendInvitation(
  adminClient: ReturnType<typeof createClient>,
  email: string,
  fullName: string,
) {
  const redirectTo =
    Deno.env.get("AUTH_REDIRECT_URL") ?? "https://oms.tastory4u.com";
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Unable to send invitation.");
  }
  return data;
}

async function assignInvitedUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  email: string,
  fullName: string,
  businessId: string,
  roleId: string,
  callerId: string,
) {
  const { error: profileError } = await adminClient.from("users").upsert({
    id: userId,
    email,
    full_name: fullName,
    active_business_id: businessId,
    is_active: true,
  });
  if (profileError) return "Unable to create staff profile.";

  await adminClient
    .from("user_roles")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", userId);

  const { error: roleError } = await adminClient.from("user_roles").insert({
    business_id: businessId,
    user_id: userId,
    role_id: roleId,
    assigned_by: callerId,
  });
  return roleError ? "Unable to assign the selected role." : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
