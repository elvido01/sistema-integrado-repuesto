import { qzConnect } from './qzTrayService';

export async function qzPrintRaw(printerName: string, raw: string) {
    await qzConnect();

    const config = qz.configs.create(printerName, {
        copies: 1,
        margins: 0
    });

    const data = [{ type: "raw", format: "command", data: raw }];

    await qz.print(config, data);
}
