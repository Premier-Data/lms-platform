import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  return (
    roles?.some((r) => r.role === "admin" || r.role === "super_admin") ?? false
  );
}

// Generates a readable temporary password.
function generateTempPassword(): string {
  const words = ["Premier", "Data", "Train", "Learn", "Coach", "Match"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const sym = "!@#$%"[Math.floor(Math.random() * 5)];
  return `${word}${num}${sym}`;
}

// POST /api/admin/user-actions
// body: { action: "resend_confirmation" | "archive" | "unarchive" | "force_reset", user_id, email }
export async function POST(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { action, user_id, email } = body as {
    action?: string;
    user_id?: string;
    email?: string;
  };

  if (!action || !user_id) {
    return NextResponse.json(
      { error: "action and user_id are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  switch (action) {
    case "resend_confirmation": {
      if (!email) {
        return NextResponse.json(
          { error: "email required" },
          { status: 400 }
        );
      }
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://training.premierdata-technology.com"}/auth/confirm?next=/reset-password`,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "Invitation resent." });
    }

    case "archive": {
      // Ban the user for a very long time (effectively disables login) —
      // preserves their data but blocks access.
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h", // ~100 years
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "User archived." });
    }

    case "unarchive": {
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "User restored." });
    }

    case "force_reset": {
      if (!email) {
        return NextResponse.json(
          { error: "email required" },
          { status: 400 }
        );
      }

      const tempPassword = generateTempPassword();

      // Set the temp password and flag that they must change it on next login
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        password: tempPassword,
        user_metadata: { must_reset_password: true },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Email the temporary password to the user
      try {
        await sendNotification(email, "custom", {
          fullName: "",
          courseTitle: "",
          customSubject: "Your password has been reset",
          customHtml: `An administrator has reset your password.<br/><br/>Your temporary password is: <strong style="font-size:18px;color:#ffffff;">${tempPassword}</strong><br/><br/>Please log in with this password. You will be asked to set a new password immediately.`,
        });
      } catch {
        // Password was reset even if the email fails; surface a warning.
        return NextResponse.json({
          success: true,
          warning:
            "Password reset, but the email could not be sent. Share the temporary password manually.",
          tempPassword,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Temporary password emailed to the user.",
      });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
