import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'monedaArs',
  standalone: true
})
export class MonedaArsPipe implements PipeTransform {
  transform(value: number): string {
    if (value == null) return '';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }
}
