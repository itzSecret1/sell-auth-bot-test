# Límite Diario de Comandos de Discord

## Problema

Discord tiene un **límite de 200 comandos por día** por aplicación. Este límite se aplica a:
- Creación de comandos nuevos (POST)
- Actualización de comandos existentes (PUT batch) - aunque normalmente no cuenta contra el límite, en algunos casos puede hacerlo

## Estado Actual

El bot ha alcanzado el límite diario de Discord. Los comandos `vouch` y `setup` se están cargando correctamente en memoria, pero **no se pueden registrar** en Discord hasta que el límite se libere.

## Soluciones

### Opción 1: Esperar (Recomendado)
- El límite se libera automáticamente después de **24 horas** desde la primera creación de comando del día
- El bot intentará registrar los comandos automáticamente cada 4 horas
- **Tiempo estimado**: Hasta 24 horas desde la primera creación

### Opción 2: Usar Comandos Globales
- Los comandos globales tienen un límite más alto (200 por día también, pero es un contador separado)
- Requiere cambiar el código para registrar comandos globales en lugar de comandos de servidor
- **No recomendado** porque los comandos globales tardan hasta 1 hora en propagarse

### Opción 3: Reducir el Número de Comandos
- Eliminar comandos no esenciales
- Combinar comandos similares
- **No recomendado** porque reduce la funcionalidad del bot

## Verificación

Para verificar si el límite se ha liberado:

```bash
pm2 logs sellbot --lines 100 | grep "Daily command creation limit"
```

Si no aparece el error, el límite se ha liberado y los comandos deberían registrarse automáticamente.

## Prevención Futura

1. **Usar PUT batch siempre**: El método PUT batch normalmente no cuenta contra el límite diario
2. **Evitar reinicios frecuentes**: Cada reinicio intenta registrar todos los comandos
3. **Usar comandos de servidor**: Los comandos de servidor se registran más rápido que los globales
4. **Monitorear el límite**: Revisar los logs regularmente para detectar cuando se acerca el límite

## Nota Importante

El límite de 200 comandos por día es un límite de **Discord**, no del bot. No hay forma de evitarlo excepto esperando a que se libere automáticamente.

