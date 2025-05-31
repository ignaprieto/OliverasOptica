import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const { data, error } = await supabase.getClient().auth.getSession();

  const session = data.session;

  if (!session || !session.user) {
    router.navigate(['/login']);
    return false;
  }

  return true;
};
