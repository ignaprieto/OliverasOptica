import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';
import { PermisosService } from '../services/permisos.service';

const RUTA_A_VISTA: { [key: string]: string } = {
  '/dashboard': 'dashboard',
  '/ventas': 'ventas',
  '/productos': 'productos', 
  '/stock': 'stock',
  '/descuentos': 'descuentos',
  '/finanzas': 'finanzas',
  '/clientes': 'clientes',
  '/aumento': 'aumento',
  '/historial': 'historial',
  '/deposito': 'deposito',
  '/caja': 'caja',
  '/empleados': 'empleados',
  '/configuracion': 'configuracion'
};

export const roleGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);
  const permisosService = inject(PermisosService);

  await permisosService.cargarPermisos(); 

  const user = await supabase.getCurrentUser();
  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  const rol = user.user_metadata?.['rol'];
  if (rol === 'admin') return true;

  const urlBase = state.url.split('?')[0].split('/')[1]; 
  const vistaRequerida = RUTA_A_VISTA[`/${urlBase}`] || urlBase;

  // ✅ CORRECCIÓN FINAL: Permitir siempre 'dashboard'
  if (vistaRequerida === 'dashboard' || !vistaRequerida) {
     return true; 
  }

  if (permisosService.puede(vistaRequerida, 'ver')) {
    return true;
  }
  
  // Si falla, mandar al dashboard (que es seguro), NO a la primera vista accesible
  router.navigate(['/dashboard']); 
  return false;
};