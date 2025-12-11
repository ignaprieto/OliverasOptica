import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const redirectGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  const role = await supabase.getCurrentUserRole();

  if (role === 'admin') {
    router.navigate(['/dashboard'], { replaceUrl: true });
    return false;
  }

  if (role === 'vendedor') {
    const home = await supabase.getPrimeraVistaAccesible();
    if (home) {
      router.navigate([`/${home}`], { replaceUrl: true });
    } else {
      // Vendedor sin permisos asignados
      router.navigate(['/login'], { replaceUrl: true });
    }
    return false;
  }

  // Si llega aquí es que no hay sesión válida, deja pasar al login (o redirige)
  return true; 
};