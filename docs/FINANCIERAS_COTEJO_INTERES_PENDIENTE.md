# Cotejo pendiente: préstamos a interés de Odalys e Inversiones

**Fecha del análisis: 21/07/2026.** Pendiente de cotejar contra el sistema viejo
(SiiF) cuando haya acceso a las bases de Odalys e Inversiones.

> Los montos de interés **cambian todos los días**. Las cifras de aquí son al
> 21/07/2026; para cotejar en otra fecha hay que recalcular con la fórmula del
> final.

## Qué se arregló (ya en producción)

Caso **ISABEL DEL ROSARIO** (Odalys, PT-0000880): el viejo mostraba 18,990 y
MotoFlow 15,554.16. La diferencia era el interés corriente acumulado desde su
último pago (28/04/2026), que MotoFlow no calculaba.

Causa: la línea `>>INTERES<<` solo se generaba cuando el préstamo tenía una
cuota con interés pendiente. Los préstamos a interés con el interés al día
quedaron con **una sola cuota, de capital puro**, sin nada que anclara el
cálculo. Arreglado en `sql/interes_corriente_prestamos_a_interes.sql`
(corrido el 21/07/2026 16:34 UTC): marca `prestamos.es_solo_interes` y ancla
el interés al **último pago del cliente**.

Resultado en Isabel: **18,983.74** contra 18,990 del viejo — 6 pesos por el día
de corte. La fórmula reproduce al viejo.

Alcance: 107 préstamos marcados (47 Naranjos, 24 Odalys, 36 Inversiones).

## Lo que hay que cotejar

Tres normales y uno parado, para separar las dos cosas:

| Cliente | Préstamo | Balance MotoFlow 21/07 |
|---|---|---|
| CARMEN LUZ RUIZ (Odalys) | PT-0000869 | 47,317.60 |
| DIONISIO AVILA (Odalys) | PT-0000950 | 46,943.07 |
| RIGOBERTO FERNANDEZ ULLOA (Odalys) | PT-0000453 | 47,669.18 ← parado |

Si los normales cuadran y el parado no, lo único pendiente es decidir qué hacer
con la cartera vieja.

## Casos que exigen decisión: el interés supera al capital

Nadie paró el reloj en estos préstamos. La fórmula está bien; el problema es
que llevan años sin pago y el interés siguió corriendo.

| Cliente | Préstamo | Capital | Último pago | Interés | Balance |
|---|---|---|---|---|---|
| RAULIN AVILA DE PAULA | PT-0000501 | 29,000.00 | **nunca** (desde 11/12/2021) | 112,317.40 | **141,317.40** |
| RIGOBERTO FERNANDEZ ULLOA | PT-0000453 | 3,593.42 | 11/06/2021 | 44,075.76 | **47,669.18** |
| GENAUDY CABRERA INIA | PT-0000595 | 3,978.29 | 25/05/2023 | 15,059.77 | 19,038.06 |
| JOSEPH PIERRE | PT-0000621 | 5,051.60 | 27/06/2023 | 13,008.97 | 18,060.57 |
| BASILIO GUERRERO (Inversiones) | PT-0000730 | 5,000.00 | 31/07/2025 | 5,828.77 | 10,828.77 |

Opciones: castigarlos (módulo Cuentas Incobrables), topar el interés, o dejarlos
como están si el viejo cobra lo mismo.

## Tres préstamos con tasa 0% (nunca generan interés)

Revisar si les falta la tasa: NESTOR ANDRECITE-LOLA (15,000, Odalys),
GABRIEL LIPEPEZ (12,000, Odalys), JULIO RAFAEL MATOS DE LA CRUZ (9,000,
Inversiones).

## ODALYS — 24 préstamos a interés

| Cliente | Préstamo | Capital | Tasa | Últ. pago | Interés | Balance |
|---|---|---|---|---|---|---|
| RIGOBERTO FERNANDEZ ULLOA | PT-0000453 | 3,593.42 | 20 | 2021-06-11 | 44,075.76 | 47,669.18 |
| GENAUDY CABRERA INIA | PT-0000595 | 3,978.29 | 10 | 2023-05-25 | 15,059.77 | 19,038.06 |
| JOSEPH PIERRE | PT-0000621 | 5,051.60 | 7 | 2023-06-27 | 13,008.97 | 18,060.57 |
| CARMEN LUZ RUIZ | PT-0000869 | 42,507.81 | 10 | 2026-06-17 | 4,809.79 | 47,317.60 |
| BASILIO ALBERTO JACKSON | PT-0000818 | 40,594.60 | 5 | 2026-05-28 | 3,564.54 | 44,159.14 |
| ISABEL DEL ROSARIO | PT-0000880 | 15,554.16 | 8 | 2026-04-28 | 3,429.58 | 18,983.74 |
| JOANNY GUERRERO LAUREANO | PT-0000927 | 29,771.69 | 10 | 2026-06-19 | 3,172.93 | 32,944.62 |
| GLADYS YAMBATIS YAMIS | PT-0000949 | 21,157.54 | 10 | 2026-06-16 | 2,463.55 | 23,621.09 |
| CESAR J. SOLER VALDEZ | PT-0000722 | 6,761.66 | 5 | 2026-02-09 | 1,823.78 | 8,585.44 |
| JOSE ANT. SANTANA MERCEDES | PT-0000651 | 3,592.50 | 10 | 2026-03-04 | 1,637.79 | 5,230.29 |
| RAYSA Y. DE LA CRUZ SANTANA | PT-0000807 | 9,600.82 | 10 | 2026-06-17 | 1,086.34 | 10,687.16 |
| DIONISIO AVILA | PT-0000950 | 46,094.43 | 8 | 2026-07-14 | 848.64 | 46,943.07 |
| HILDA M. CASTILLO | PT-0000889 | 2,120.00 | 6 | 2026-01-22 | 757.28 | 2,877.28 |
| DIONISIO AVILA | PT-0000979 | 38,513.10 | 7 | 2026-07-14 | 620.43 | 39,133.53 |
| WILLIAN FELIX BELTRAN | PT-0000977 | 7,997.88 | 10 | 2026-06-30 | 552.18 | 8,550.06 |
| WAGNER NORTILUS | PT-0000957 | 1,968.49 | 10 | 2026-05-18 | 413.12 | 2,381.61 |
| LEO V. SANCHEZ CEDANO | PT-0000905 | 2,838.64 | 10 | 2026-06-29 | 205.32 | 3,043.96 |
| JOSE M. REYES RODRIGUEZ | PT-0000844 | 6,097.00 | 3 | 2026-07-06 | 90.20 | 6,187.20 |
| MARTHA Y. REYES DE CASTILLO | PT-0000895 | 8,879.02 | 3 | 2026-07-15 | 52.54 | 8,931.56 |
| IGNACIA CONTRERAS | PT-0000846 | 3,200.00 | 3 | 2026-07-13 | 25.25 | 3,225.25 |
| BIENVENIDO CASTILLO | PT-0000992 | 3,000.00 | 10 | 2026-07-20 | 9.86 | 3,009.86 |
| NESTOR ANDRECITE-LOLA | PT-0000976 | 15,000.00 | 0 | 2026-06-26 | 0.00 | 15,000.00 |
| GABRIEL LIPEPEZ | PT-0000991 | 12,000.00 | 0 | 2026-07-08 | 0.00 | 12,000.00 |
| RAULIN AVILA DE PAULA | PT-0000501 | 29,000.00 | 7 | sin pagos | 112,317.40 | 141,317.40 |
| **TOTAL** | | **358,872.65** | | | **97,707.62** (*) | **456,580.27** (*) |

(*) El total de la tabla original contaba 0 para Raulin (sin pagos). Con el
interés desde el desembolso, el total real sube a ~209,000 de interés.

## INVERSIONES LOS NARANJOS — 36 préstamos a interés

| Cliente | Préstamo | Capital | Tasa | Últ. pago | Interés | Balance |
|---|---|---|---|---|---|---|
| BASILIO GUERRERO | PT-0000730 | 5,000.00 | 10 | 2025-07-31 | 5,828.77 | 10,828.77 |
| DANIEL ESTRELLA CASTILLO | PT-0000749 | 25,000.00 | 10 | 2026-06-15 | 2,993.15 | 27,993.15 |
| ESTALIEN LECCIUS | PT-0000732 | 17,900.00 | 10 | 2026-06-09 | 2,496.19 | 20,396.19 |
| NARCISO PEREZ | PT-0000747 | 50,000.00 | 7 | 2026-07-06 | 1,726.03 | 51,726.03 |
| MOLIERE KESNOLD | PT-0000682 | 14,129.06 | 10 | 2026-06-16 | 1,645.17 | 15,774.23 |
| FANNY CASTILLO SANTANA | PT-0000714 | 49,100.00 | 8 | 2026-07-09 | 1,549.68 | 50,649.68 |
| CARLOS E. RODRIGUEZ MARTINEZ | PT-0000535 | 30,855.87 | 10 | 2026-07-06 | 1,521.66 | 32,377.53 |
| FELIPE F. JOSE ELISEO RUIZ | PT-0000712 | 10,421.70 | 9 | 2026-06-05 | 1,431.34 | 11,853.04 |
| BANTROING OLIVER SANTANA | PT-0000624 | 8,065.01 | 10 | 2026-06-08 | 1,151.20 | 9,216.21 |
| EDUAR SANTANA SALICHE | PT-0000596 | 3,413.61 | 10 | 2026-04-18 | 1,057.75 | 4,471.36 |
| EFRAIN DE LA CRUZ POLIER | PT-0000586 | 12,610.03 | 10 | 2026-06-29 | 912.07 | 13,522.10 |
| SANTOS RODRIGUEZ CASERES | PT-0000676 | 4,442.84 | 10 | 2026-05-25 | 824.05 | 5,266.89 |
| LUCBERT MERONA | PT-0000743 | 15,000.00 | 10 | 2026-07-06 | 739.73 | 15,739.73 |
| ANYELI M. HERNANDEZ | PT-0000725 | 6,000.00 | 7 | 2026-05-30 | 709.97 | 6,709.97 |
| JUAN POUERIET POUERIET | PT-0000610 | 12,990.29 | 10 | 2026-07-06 | 640.62 | 13,630.91 |
| RAFAEL SANCHEZ | PT-0000675 | 8,954.39 | 7 | 2026-06-22 | 597.61 | 9,552.00 |
| GUILLERMO DE LEON | PT-0000589 | 3,789.17 | 7 | 2026-05-29 | 457.09 | 4,246.26 |
| PORFIRIO ROQUE CARABALLO | PT-0000695 | 30,674.81 | 5 | 2026-07-14 | 352.97 | 31,027.78 |
| JOSE RAMON MINAYA | PT-0000736 | 2,500.00 | 10 | 2026-06-13 | 315.75 | 2,815.75 |
| JENNY M. CANARIO TORRE | PT-0000652 | 5,239.78 | 10 | 2026-07-13 | 137.81 | 5,377.59 |
| RENZO A VILLAVICENCIO | PT-0000672 | 3,287.17 | 8 | 2026-07-08 | 112.39 | 3,399.56 |
| ANYELI M. HERNANDEZ | PT-0000658 | 829.51 | 7 | 2026-05-30 | 98.16 | 927.67 |
| FRANCISCO ALEXIS | PT-0000680 | 2,433.76 | 10 | 2026-07-10 | 88.02 | 2,521.78 |
| JUAN POUERIET POUERIET | PT-0000633 | 1,303.71 | 10 | 2026-07-06 | 64.29 | 1,368.00 |
| NICOLA HAILLENNE PIE | PT-0000564 | 135.08 | 10 | 2026-03-16 | 56.26 | 191.34 |
| LAZARO DURAN REYES | PT-0000746 | 1,039.45 | 10 | 2026-07-16 | 17.09 | 1,056.54 |
| BERNARDA YAN MICHEL | PT-0000719 | 2,200.00 | 10 | 2026-07-20 | 7.23 | 2,207.23 |
| DERIS ANCIUS | PT-0000579 | 176.16 | 10 | 2026-07-10 | 6.37 | 182.53 |
| EDWIN R. MATOS | PT-0000592 | 175.48 | 5 | 2026-07-16 | 1.44 | 176.92 |
| DAULY RIJO | PT-0000520 | 0.40 | 8 | 2024-06-03 | 0.77 | 1.17 |
| NIKAURY REINOSO | PT-0000410 | 0.08 | 8 | 2023-02-09 | 0.41 | 0.49 |
| JULIO RAFAEL MATOS DE LA CRUZ | PT-0000700 | 9,000.00 | 0 | 2026-07-02 | 0.00 | 9,000.00 |
| CLAUDIO JIMENEZ POLANCO | PT-0000750 | 32,700.00 | 10 | sin pagos (15/07/26) | 645.04 | 33,345.04 |
| MAXIMO B. CEDENO ROJAS | PT-0000666 | 20,000.00 | 10 | sin pagos (27/01/26) | 11,578.08 | 31,578.08 |
| CARMENIA A. BRITO CASTILLO | PT-0000740 | 50,000.00 | 10 | sin pagos (29/06/26) | 3,616.44 | 53,616.44 |
| BRYAN GERMAN | PT-0000738 | 20,000.00 | 8 | sin pagos (18/06/26) | 1,757.81 | 21,757.81 |
| **TOTAL** | | **459,367.36** | | | **44,538.41** | **503,905.77** |

## Fórmula (para recalcular en otra fecha)

La misma de `get_prestamos_cliente`, tomada del CPF viejo:

```
ancla    = último pago del cliente (o el desembolso si nunca pagó)
n_meses  = meses completos entre ancla y hoy
dias     = días sueltos después de esos meses
interes  = n_meses * round(capital * tasa/100, 2)
         + round(capital * (tasa/100) * 12 * dias / 365, 2)
balance  = capital pendiente + interes
```

Los cargos manuales pendientes (Otras Transacciones) van aparte y se suman
al balance en la pantalla de cobro.
