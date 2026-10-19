import Decimal from 'decimal.js';
/**
 * Calculate tax or GST
 * Exclusive mode: tax is added to base amount
 * Inclusive mode: tax is included in total amount
 */
export function calculateTax(input) {
    const amount = new Decimal(input.amount);
    const rate = new Decimal(input.rate).div(100);
    if (input.mode === 'exclusive') {
        // Tax is added to base amount
        const taxAmount = amount.mul(rate);
        const totalAmount = amount.add(taxAmount);
        return {
            baseAmount: amount.toNumber(),
            taxAmount: taxAmount.toNumber(),
            totalAmount: totalAmount.toNumber(),
        };
    }
    else {
        // Tax is included in total amount
        // Total = Base * (1 + rate), so Base = Total / (1 + rate)
        const divisor = rate.add(1);
        const baseAmount = amount.div(divisor);
        const taxAmount = amount.sub(baseAmount);
        return {
            baseAmount: baseAmount.toNumber(),
            taxAmount: taxAmount.toNumber(),
            totalAmount: amount.toNumber(),
        };
    }
}
/**
 * Calculate discount
 * Formula: Final Price = Original Price * (1 - discountRate/100)
 */
export function calculateDiscount(input) {
    const originalPrice = new Decimal(input.originalPrice);
    const discountRate = new Decimal(input.discountRate).div(100);
    const discountAmount = originalPrice.mul(discountRate);
    const finalPrice = originalPrice.sub(discountAmount);
    return {
        discountAmount: discountAmount.toNumber(),
        finalPrice: finalPrice.toNumber(),
    };
}
