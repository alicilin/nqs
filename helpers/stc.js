export async function stc(cb) {
    try {
        return await cb();
    } catch (error) {
        return error;
    }
}