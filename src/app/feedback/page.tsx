"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase"; 
import { useAuthState } from "react-firebase-hooks/auth";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore"; 
import { Feedback, UserProfile } from "@/../../shared/models/types";

export default function FeedbackPage() {
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, loading, error] = useAuthState(auth);
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
      if (user && db) { 
        try {
          const userDocRef = doc(db, "users", user.uid);
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

  const redirectToMailClient = (data: Omit<Feedback, 'createdAt' | 'id'>, errorMessage?: string) => {
    const mailToSubject = "Feedback de la Aplicación (Fallback)";
    const mailToBodyParts = [
      `Feedback: ${data.text}`,
      `--- Detalles Técnicos (Fallback) ---`,
      `Usuario ID: ${data.userId}`,
      `Usuario Email: ${data.userEmail}`,
      `Residencia ID: ${data.residenciaId || 'No especificada'}`,
      `Página: ${data.page}`,
      `Navegador: ${data.userAgent}`,
      `Resolución Pantalla: ${data.screenResolution}`,
      `Tamaño Ventana: ${data.viewportSize}`,
      `Fecha (aprox. cliente): ${new Date().toISOString()}`,
    ];
    if (errorMessage) {
      mailToBodyParts.push(`Error: ${errorMessage}`);
    }
    const mailToBody = encodeURIComponent(mailToBodyParts.join(""));
    const mailtoLink = `mailto:drcaceres@gmail.com?subject=${encodeURIComponent(mailToSubject)}&body=${mailToBody}`;
    
    if (typeof window !== "undefined") {
      window.location.href = mailtoLink;
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!feedbackText.trim()) {
      toast({
        title: "Error",
        description: "Por favor, escribe tu feedback antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Error",
        description: "Debes iniciar sesión para enviar feedback.",
        variant: "destructive",
      });
      // Podrías considerar redirigir al login aquí si fuera necesario
      return;
    }
    
    setIsSubmitting(true);

    const feedbackData: Omit<Feedback, 'createdAt' | 'id'> = {
      userId: user.uid,
      userEmail: user.email || "No disponible",
      residenciaId: userProfile?.residenciaId || undefined,
      text: feedbackText,
      page: pageUrl,
      userAgent: userAgent,
      screenResolution: screenResolution,
      viewportSize: viewportSize,
      status: "nuevo",
    };

    if (!db) {
      console.error("Error de configuración: La base de datos (db) no está disponible. Redirigiendo a cliente de correo.");
      redirectToMailClient(feedbackData, "La conexión con la base de datos no está disponible.");
      setIsSubmitting(false);
      return;
    }

    try {
      await addDoc(collection(db, "feedback"), {
        ...feedbackData,
        createdAt: serverTimestamp(), 
      });

      toast({
        title: "Feedback Enviado",
        description: "¡Gracias por tus comentarios!",
      });
      setFeedbackText(""); // Limpiar el campo de texto solo en caso de éxito
      setIsSubmitting(false);

    } catch (err) {
      console.error("Error al enviar feedback a Firestore. Redirigiendo a cliente de correo:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      redirectToMailClient(feedbackData, `Error al guardar en Firestore: ${errorMessage}`);
      // No limpiar feedbackText aquí para que el usuario no lo pierda si la redirección falla o la cierra
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 md:p-8 max-w-2xl text-center">
        <p>Cargando información de usuario...</p>
      </div>
    );
  }

  if (error) {
    // Este error es sobre la carga del usuario, no sobre el envío de feedback
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

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-center">Dejar Feedback</h1>
        <p className="text-muted-foreground text-center mt-2">
          Tus comentarios nos ayudan a mejorar la aplicación. Si reportas un error, incluye los pasos para reproducirlo.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="feedback-textarea" className="text-lg">Tus comentarios:</Label>
          <Textarea
            id="feedback-textarea"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Escribe tus comentarios aquí..."
            rows={8}
            className="mt-2 text-base"
            disabled={isSubmitting}
          />
        </div>
        
        <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md space-y-1">
            <p><strong>URL:</strong> {pageUrl}</p>
            <p><strong>Navegador:</strong> {userAgent}</p>
            <p><strong>Resolución Pantalla:</strong> {screenResolution}</p>
            <p><strong>Tamaño Ventana:</strong> {viewportSize}</p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || !user} className="text-lg px-6 py-3">
            {isSubmitting ? "Enviando..." : "Enviar Feedback"}
          </Button>
        </div>
      </form>
    </div>
  );
}
