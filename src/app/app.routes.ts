import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  // Ruta raíz - redirige a login (el login manejará la redirección según rol)
  { 
    path: '', 
    redirectTo: 'login', 
    pathMatch: 'full' 
  },

  // Login (pública)
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },

  // Dashboard - Requiere autenticación y permisos
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Stock - Requiere autenticación y permisos
  {
    path: 'stock',
    loadComponent: () =>
      import('./pages/stock/stock.component').then((m) => m.StockComponent),
    canActivate: [authGuard, roleGuard],
  },

  // Productos - Requiere autenticación y permisos
  {
    path: 'productos',
    loadComponent: () =>
      import('./pages/productos/productos.component').then(
        (m) => m.ProductosComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Ventas - Requiere autenticación y permisos
  {
    path: 'ventas',
    loadComponent: () =>
      import('./pages/ventas/ventas.component').then((m) => m.VentasComponent),
    canActivate: [authGuard, roleGuard],
  },

  // Descuentos - Requiere autenticación y permisos
  {
    path: 'descuentos',
    loadComponent: () =>
      import('./pages/descuentos/descuentos.component').then(
        (m) => m.DescuentosComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Historial - Requiere autenticación y permisos
  {
    path: 'historial',
    loadComponent: () =>
      import('./pages/historial/historial.component').then(
        (m) => m.HistorialComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Aumento - Requiere autenticación y permisos
  {
    path: 'aumento',
    loadComponent: () =>
      import('./pages/aumento/aumento.component').then(
        (m) => m.AumentoComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Finanzas - Requiere autenticación y permisos
  {
    path: 'finanzas',
    loadComponent: () =>
      import('./pages/finanzas/finanzas.component').then(
        (m) => m.FinanzasComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Empleados - Requiere autenticación y permisos
  {
    path: 'empleados',
    loadComponent: () =>
      import('./pages/empleados/empleados.component').then(
        (m) => m.EmpleadosComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Configuracion - Requiere autenticación y permisos
  {
    path: 'configuracion',
    loadComponent: () =>
      import('./pages/configuracion/configuracion.component').then(
        (m) => m.ConfiguracionComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Caja - Requiere autenticación y permisos
  {
    path: 'caja',
    loadComponent: () =>
      import('./pages/caja/caja.component').then(
        (m) => m.CajaComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Deposito - Requiere autenticación y permisos
  {
    path: 'deposito',
    loadComponent: () =>
      import('./pages/deposito/deposito.component').then(
        (m) => m.DepositoComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Clientes - Requiere autenticación y permisos
  {
    path: 'clientes',
    loadComponent: () =>
      import('./pages/clientes/clientes.component').then(
        (m) => m.ClientesComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Rutas no encontradas redirigen a login
  { 
    path: '**', 
    redirectTo: 'login'
  },
];