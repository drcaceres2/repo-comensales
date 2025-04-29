"use client";

import {Button} from "@/components/ui/button";
import {useRouter} from "next/navigation";
import {useEffect} from "react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // For now, redirect to the meal schedule page.
    router.push("/meal-schedule");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h1 className="text-4xl font-bold tracking-tight">
        Welcome to <span className="text-primary">ResiMeals</span>
      </h1>
      <p className="text-muted-foreground">
        Your meal schedule management app for university residences.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => router.push("/login")}>Log In</Button>
        <Button variant="secondary" onClick={() => router.push("/register")}>
          Register
        </Button>
      </div>
    </div>
  );
}
