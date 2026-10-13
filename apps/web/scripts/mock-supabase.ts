export const dbMock = {
  existingTx: null as any,
  existingTxErr: null as any,
  orderRecord: null as any,
  orderErr: null as any,
  updateErr: null as any,
  eventErr: null as any,
  upsertErr: null as any,
  orderUpdates: [] as any[],
  orderEvents: [] as any[],
  txUpserts: [] as any[],
  reset() {
    this.existingTx = null;
    this.existingTxErr = null;
    this.orderRecord = null;
    this.orderErr = null;
    this.updateErr = null;
    this.eventErr = null;
    this.upsertErr = null;
    this.orderUpdates = [];
    this.orderEvents = [];
    this.txUpserts = [];
  }
};

export function createClient(_url: string, _key: string) {
  return {
    from: (table: string) => {
      if (table === 'payment_transactions') {
        return {
          select: () => ({
            or: () => ({
              maybeSingle: async () => ({
                data: dbMock.existingTx,
                error: dbMock.existingTxErr
              })
            })
          }),
          upsert: async (record: any) => {
            dbMock.txUpserts.push({ ...record });
            if (dbMock.upsertErr) return { error: dbMock.upsertErr };
            dbMock.existingTx = { ...record, id: dbMock.existingTx?.id || 'tx-persisted-uuid' };
            return { error: null };
          }
        };
      }
      if (table === 'online_orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: dbMock.orderRecord,
                error: dbMock.orderErr
              })
            })
          }),
          update: (updateData: any) => ({
            eq: async () => {
              dbMock.orderUpdates.push({ ...updateData });
              if (dbMock.updateErr) return { error: dbMock.updateErr };
              if (dbMock.orderRecord) {
                dbMock.orderRecord.status = updateData.status;
              }
              return { error: null };
            }
          })
        };
      }
      if (table === 'order_events') {
        return {
          insert: async (eventData: any) => {
            dbMock.orderEvents.push({ ...eventData });
            return { error: dbMock.eventErr };
          }
        };
      }
      throw new Error(`Tabla no manejada en mock: ${table}`);
    }
  };
}
