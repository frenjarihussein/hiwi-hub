import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { collectDeviceInfo } from "@/lib/device";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { UserRound, X } from "lucide-react";
import logoAsset from "@/assets/yousef-soft-logo.png.asset.json";
import { bootstrapOwner, ownerExists, ensureDemoAccount } from "@/lib/admin.functions";
import { logLoginEvent } from "@/lib/login-log.functions";
import { thisDeviceId } from "@/lib/operating-mode";
import { PinUnlock } from "@/components/OfflinePin";
import { readLoginBrand, useSystemBrand, useSystemTitle, type LoginBrand } from "@/lib/branding";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | يوسف سوفت" },
      { name: "description", content: "الدخول إلى نظام المحاسبة وإدارة المشاريع متعدد الشركات." },
      { property: "og:title", content: "تسجيل الدخول | يوسف سوفت" },
      { property: "og:description", content: "الدخول إلى نظام المحاسبة وإدارة المشاريع." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const signup = false;
  const [brand, setBrand] = useState<LoginBrand | null>(null);
  useEffect(() => setBrand(readLoginBrand()), []);
  const sys = useSystemBrand().data;
  const sysName = sys?.system_name || "يوسف سوفت";
  useSystemTitle(sys?.system_name);
  const [savedAccounts, setSavedAccounts] = useState<{ email: string }[]>([]);

  // Load saved accounts (this device only); migrate the old single-account key
  useState(() => {
    try {
      let accounts: { email: string }[] = [];
      const raw = localStorage.getItem("ys_saved_accounts");
      if (raw) accounts = JSON.parse(raw);
      const old = localStorage.getItem("ys_saved_login");
      if (old) {
        const saved = JSON.parse(old) as { email?: string; password?: string };
        if (saved.email && !accounts.some((a) => a.email === saved.email)) {
          accounts.push({ email: saved.email });
        }
        localStorage.removeItem("ys_saved_login");
      }
      setSavedAccounts(accounts);
      const first = accounts[0];
      if (first) {
        setEmail(first.email);
        setRemember(true);
      }
    } catch {
      /* ignore */
    }
  });

  // Ask the browser's own password manager for a saved credential (never stored by the app)
  async function loadCredential(mediation: "optional" | "silent" = "optional") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cred: any = await (navigator.credentials as any)?.get?.({ password: true, mediation });
      if (cred?.id && cred?.password) {
        setEmail(cred.id);
        setPassword(cred.password);
        setRemember(true);
      }
    } catch {
      /* unsupported browser */
    }
  }
  useEffect(() => {
    void loadCredential("silent");
  }, []);

  function pickAccount(acc: { email: string }) {
    setEmail(acc.email);
    setPassword("");
    setRemember(true);
    void loadCredential("optional");
  }

  function removeAccount(emailToRemove: string) {
    const next = savedAccounts.filter((a) => a.email !== emailToRemove);
    setSavedAccounts(next);
    try {
      localStorage.setItem("ys_saved_accounts", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const checkOwner = useServerFn(ownerExists);
  const createOwner = useServerFn(bootstrapOwner);

  const owner = useQuery({
    queryKey: ["owner_exists"],
    queryFn: () => checkOwner({}),
    staleTime: 0,
  });
  const needsOwner = owner.data?.exists === false;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setLoading(true);
    try {
      if (signup && !needsOwner) {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("تم إنشاء الحساب. افتح بريدك واضغط رابط التأكيد ثم سجّل الدخول.");
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["me"] });
        navigate({ to: "/home" });
        return;
      }
      if (needsOwner) {
        await createOwner({ data: { email, password, fullName } });
        toast.success("تم إنشاء حساب مدير النظام");
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      logLoginEvent({ data: { event: "sign_in", deviceId: thisDeviceId(), deviceInfo: collectDeviceInfo() } }).catch(() => {});
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      try {
        if (remember) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const PC = (window as any).PasswordCredential;
          if (PC) await navigator.credentials.store(new PC({ id: email, password, name: email })).catch(() => {});
          const next = [
            { email },
            ...savedAccounts.filter((a) => a.email !== email),
          ];
          setSavedAccounts(next);
          localStorage.setItem("ys_saved_accounts", JSON.stringify(next));
        } else {
          const next = savedAccounts.filter((a) => a.email !== email);
          setSavedAccounts(next);
          localStorage.setItem("ys_saved_accounts", JSON.stringify(next));
        }
      } catch {
        /* ignore */
      }
      toast.success("تم تسجيل الدخول");
      navigate({ to: "/home" }); // super admin is redirected to /companies by AppShell
    } catch (err) {
      const msg = (err as Error).message || "";
      toast.error(/banned/i.test(msg) ? "تم إيقاف هذا الحساب مؤقتاً، يرجى مراجعة إدارة الشركة" : msg || "تعذر إتمام العملية");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <h1 className="sr-only">{brand?.name ?? sysName}</h1>
          {brand ? (
            <div className="flex flex-col items-center gap-2">
              <img src={brand.logo} alt={brand.name ?? ""} className="max-h-32 w-44 object-contain" />
              {brand.name && <div className="text-center text-xl font-bold text-foreground">{brand.name}</div>}
            </div>
          ) : (
            <img src={sys?.logo_url || logoAsset.url} alt={sysName} className="w-44 object-contain" />
          )}
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          {needsOwner
            ? "لا يوجد مدير نظام بعد. أنشئ حساب مدير النظام للبدء."
            : brand?.name ? `أهلاً بك في ${brand.name}` : `أهلاً بك في ${sysName}، يسعدنا انضمامك.`}
        </p>

        {!needsOwner && savedAccounts.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">حسابات دخلت من هذا الجهاز:</p>
            <div className="space-y-1">
              {savedAccounts.map((acc) => (
                <div
                  key={acc.email}
                  className="flex items-center gap-1 rounded-md border bg-secondary/50 pe-1"
                >
                  <button
                    type="button"
                    onClick={() => pickAccount(acc)}
                    className="flex flex-1 items-center gap-2 px-3 py-2 text-start text-sm hover:text-primary"
                  >
                    <UserRound className="size-4 shrink-0 text-muted-foreground" />
                    <span dir="ltr" className="truncate">{acc.email}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAccount(acc.email)}
                    aria-label="حذف الحساب المحفوظ"
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!needsOwner && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-semibold">حساب ديمو للتجربة</p>
            <p className="mt-1 text-muted-foreground">البريد: <span dir="ltr" className="font-mono">demo@yousef-soft.com</span></p>
            <p className="text-muted-foreground">كلمة المرور: <span dir="ltr" className="font-mono">Demo2027</span></p>
            <Button type="button" size="sm" variant="outline" className="mt-2 w-full" disabled={loading} onClick={async () => {
              setLoading(true);
              try {
                await ensureDemoAccount();
                const { error } = await supabase.auth.signInWithPassword({ email: "demo@yousef-soft.com", password: "Demo2027" });
                if (error) throw error;
                logLoginEvent({ data: { event: "sign_in", deviceId: thisDeviceId(), deviceInfo: collectDeviceInfo() } }).catch(() => {});
                await queryClient.invalidateQueries({ queryKey: ["me"] });
                navigate({ to: "/home" });
              } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
            }}>الدخول بحساب الديمو</Button>
          </div>
        )}

        <PinUnlock />
        <form onSubmit={submit} className="space-y-4">
          {(needsOwner || signup) && (
            <div className="space-y-2">
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              name="username"
              autoComplete="username"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete={needsOwner ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-primary"
            />
            تذكر البريد وكلمة المرور على هذا الجهاز
          </label>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "جارٍ المعالجة..."
              : needsOwner
                ? "إنشاء حساب مدير النظام"
                : signup ? "إنشاء حساب" : "دخول"}
          </Button>
          {!needsOwner && (
            <p className="text-center text-xs text-muted-foreground">لا يوجد تسجيل ذاتي — يُنشئ مدير النظام حسابات المستخدمين.</p>
          )}
        </form>
      </div>
    </div>
  );
}
