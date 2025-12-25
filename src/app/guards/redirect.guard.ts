import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const redirectGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  // Verificamos sesión de forma segura
  const user = await supabase.getCurrentUser();

  if (user) {
    // ✅ CAMBIO CRÍTICO: Todos (Admin y Vendedor) van al Dashboard.
    // El dashboard se encargará de mostrar solo lo permitido.
    router.navigate(['/dashboard'], { replaceUrl: true });
    return false; // Bloquea el acceso al login porque ya está autenticado
  }

  // Si no hay usuario, deja pasar al login
  return true; 
};