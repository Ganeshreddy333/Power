"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CaptchaVerificationProps = {
  verified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  resetKey?: number;
};

const createChallenge = () => {
  const first = Math.floor(Math.random() * 9) + 1;
  const second = Math.floor(Math.random() * 9) + 1;

  return {
    question: `${first} + ${second}`,
    answer: String(first + second),
  };
};

const initialChallenge = { question: "–", answer: "" };

const CaptchaVerification = ({ verified, onVerifiedChange, resetKey }: CaptchaVerificationProps) => {
  const [challenge, setChallenge] = useState(initialChallenge);
  const [answer, setAnswer] = useState("");
  const challengeId = useId();

  const refreshChallenge = () => {
    setChallenge(createChallenge());
    setAnswer("");
    onVerifiedChange(false);
  };

  useEffect(() => {
    refreshChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const handleAnswerChange = (value: string) => {
    setAnswer(value);
    onVerifiedChange(value.trim() === challenge.answer);
  };

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <label htmlFor={challengeId} className="mb-2 block text-sm font-semibold text-foreground">
        Captcha Verification *
      </label>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="rounded-md border border-border bg-background px-4 py-2 text-center font-display text-lg font-bold text-foreground">
          {challenge.question}
        </div>
        <Input
          id={challengeId}
          inputMode="numeric"
          placeholder="Enter answer"
          value={answer}
          onChange={(event) => handleAnswerChange(event.target.value)}
          aria-invalid={!verified && answer.length > 0}
        />
        <Button type="button" variant="outline" size="icon" onClick={refreshChallenge} aria-label="Refresh captcha">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <p className={`mt-2 text-sm ${verified ? "text-teal" : "text-muted-foreground"}`}>
        {verified ? "Captcha verified." : "Solve the captcha before continuing."}
      </p>
    </div>
  );
};

export default CaptchaVerification;
