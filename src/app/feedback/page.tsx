"use client";

import { useState, useEffect, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/useToast";
import { useAuth } from "@/hooks/useAuth";
import { doc, getDoc } from "firebase/firestore";
import { UserProfile } from "../../../shared/models/types";
import { submitFeedback } from "./actions";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";


export default function FeedbackPage() {
  const [feedbackText, setFeedbackText] = useState("");
  const { user, loading, error } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const [pageUrl, setPageUrl] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [screenResolution, setScreenResolution] = useState("");
  const [viewportSize, setViewportSize] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPageUrl(window.location.href);
      setUserAgent(navigator.userAgent);
      setScreenResolution(`${window.screen.width}x${window.screen.height}`);
      setViewportSize(`${window.innerWidth}x${window.innerHeight}`);
    }
  }, []);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user) { 
        try {
          const userDocRef = doc((await import("@/lib/firebase")).db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            setUserProfile(userDocSnap.data() as UserProfile);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
        }
      }
    };
    fetchUserProfile();
  }, [user]);
  const [state, formAction] = useActionState(submitFeedback, null);
  const { pending } = useFormStatus();

  useEffect(() => {
    if (state?.error) {
      toast({ title: "Error", description: state.error, variant: "destructive" });
    }
    if (state?.message) {
      toast({ title: "Feedback Enviado", description: state.message });
      setFeedbackText("");
    }
  }, [state, toast]);

  if (loading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 max-w-2xl text-center">
        <p>Cargando información de usuario...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 max-w-2xl text-center">
        <p className="text-red-600">Error al cargar la información de usuario: {error.message}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 max-w-2xl text-center">
        <p>Por favor, <a href="/" className="underline">inicia sesión</a> para dejar tu feedback.</p>
      </div>
    );
  }

  const isPending = pending;

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-center">Dejar Feedback</h1>
        <p className="text-muted-foreground text-center mt-2">Tus comentarios nos ayudan a mejorar la aplicación. Si reportas un error, incluye los pasos para reproducirlo.</p>
      </header>

      <form action={formAction} className="space-y-6">
        <div>
          <Label htmlFor="feedback-textarea" className="text-lg">Tus comentarios:</Label>
          <Textarea
            id="feedback-textarea"
            name="text"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Escribe tus comentarios aquí..."
            rows={8}
            className="mt-2 text-base"
            disabled={isPending}
          />
        </div>

        <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md space-y-1">
          <p><strong>URL:</strong> {pageUrl}</p>
          <p><strong>Navegador:</strong> {userAgent}</p>
          <p><strong>Resolución Pantalla:</strong> {screenResolution}</p>
          <p><strong>Tamaño Ventana:</strong> {viewportSize}</p>
        </div>

        {/* Hidden fields to pass contextual data to the server action */}
        <input type="hidden" name="page" value={pageUrl} />
        <input type="hidden" name="userAgent" value={userAgent} />
        <input type="hidden" name="screenResolution" value={screenResolution} />
        <input type="hidden" name="viewportSize" value={viewportSize} />
        <input type="hidden" name="userId" value={user?.uid || ''} />
        <input type="hidden" name="userEmail" value={user?.email || ''} />
        <input type="hidden" name="residenciaId" value={userProfile?.residenciaId || ''} />

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending || !user} className="text-lg px-6 py-3">
            {isPending ? "Enviando..." : "Enviar Feedback"}
          </Button>
        </div>
      </form>
    </div>
  );
}
