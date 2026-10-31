import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative" dir="ltr">
      <Input type={visible ? "text" : "password"} className={`pe-11 ${className ?? ""}`} {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute end-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        title={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}