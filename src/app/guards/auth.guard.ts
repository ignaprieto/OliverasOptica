import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  // getCurrentAppUser ahora maneja internamente Admin vs Vendedor y caché
  const user = await supabase.getCurrentAppUser();

  if (user) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};