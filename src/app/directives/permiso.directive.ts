import { Directive, Input, TemplateRef, ViewContainerRef, inject, OnInit, OnDestroy, ChangeDetectorRef, EffectRef, effect } from '@angular/core';
import { PermisosService } from '../services/permisos.service';
import { Subscription } from 'rxjs';

@Directive({
  selector: '[appPermiso]',
  standalone: true
})
export class PermisoDirective implements OnInit, OnDestroy {
  private templateRef = inject(TemplateRef);
  private viewContainer = inject(ViewContainerRef);
  private permisosService = inject(PermisosService);
  private cdr = inject(ChangeDetectorRef);
  
  private sub: Subscription | null = null;
  private _datosPermiso: string[] = [];
  private _viewCreated = false;

  @Input() set appPermiso(val: string[]) {
    this._datosPermiso = val;
    this.actualizarVista();
  }

  ngOnInit() {
    // Nos suscribimos a los cambios del servicio
    this.sub = this.permisosService.permisos$.subscribe((permisos) => {
      this.actualizarVista();
    });
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }

  private actualizarVista() {
    // Si no hay datos de configuración en el HTML, no hacemos nada
    if (!this._datosPermiso || this._datosPermiso.length === 0) return;

    const [vista, accion] = this._datosPermiso;
    
    // Preguntamos al servicio si tenemos permiso
    const tienePermiso = this.permisosService.puede(vista, accion as any);

    if (tienePermiso && !this._viewCreated) {
      // Si tiene permiso y la vista no está creada, la creamos
      this.viewContainer.createEmbeddedView(this.templateRef);
      this._viewCreated = true;
      this.cdr.markForCheck();
      
    } else if (!tienePermiso && this._viewCreated) {
      // Si perdió el permiso y la vista existía, la borramos
      this.viewContainer.clear();
      this._viewCreated = false;
      this.cdr.markForCheck();
    }
  }
}