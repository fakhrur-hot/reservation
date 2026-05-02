import { getDatabase } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface BookingMetric {
  totalBookings: number;
  bookingsByType: {
    standard: number;
    decorated: number;
  };
  bookingsByTimeWindow: {
    morning: number;
    afternoon: number;
    evening: number;
    lateNight: number;
  };
  bookingsBySection: Record<string, number>;
  averagePartySize: number;
  peakTimes: Array<{
    hour: number;
    bookings: number;
  }>;
  growthRate: number; // Percentage change vs previous period
}

export interface NoShowMetric {
  totalNoShows: number;
  noShowRate: number; // Percentage
  noShowsByBookingType: {
    standard: number;
    decorated: number;
  };
  noShowsByTimeWindow: {
    morning: number;
    afternoon: number;
    evening: number;
    lateNight: number;
  };
  chronicalOffenders: Array<{
    customerId: string;
    customerName: string;
    noShowCount: number;
  }>;
}

export interface TurnoverMetric {
  averageTurnaroundTime: number; // minutes
  turnoverBySection: Record<string, number>;
  tablesPerHour: number;
  sessionDurationAverage: number; // minutes
  peakTurnoverHours: number[];
  turnoverTrend: Array<{
    hour: number;
    turnover: number;
  }>;
}

export interface PromoMetric {
  totalPromoUse: number;
  promosByType: Record<string, number>;
  totalDiscountGiven: number;
  averageDiscountPerBooking: number;
  conversionRate: number; // Percentage of bookings with promo
  roiByPromo: Array<{
    promoCode: string;
    revenue: number;
    discount: number;
    roi: number;
  }>;
  topPerformingPromos: string[];
}

export interface RevenueMetric {
  totalRevenue: number;
  totalDeposits: number;
  totalDiscounts: number;
  netRevenue: number;
  revenueByBookingType: {
    standard: number;
    decorated: number;
  };
  revenueBySection: Record<string, number>;
  revenuePerTable: number;
  revenueGrowthRate: number; // Percentage
  revenueByPromo: Record<string, number>;
}

export class MetricsService {
  private cacheExpiry = 300; // 5 minutes in seconds

  /**
   * Get booking metrics for a branch during a date range
   */
  async getBookingMetrics(branchId: string, dateRange: DateRange): Promise<BookingMetric> {
    const cacheKey = `metrics:bookings:${branchId}:${dateRange.startDate.getTime()}:${dateRange.endDate.getTime()}`;
    
    try {
      // Check cache first
      const cached = await getRedis().get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const query = `
        SELECT 
          COUNT(*) as total_bookings,
          booking_type,
          EXTRACT(HOUR FROM start_time) as hour,
          EXTRACT(DOW FROM reservation_date) as day_of_week,
          COALESCE(section, 'Unknown') as section,
          AVG(party_size) as avg_party_size,
          party_size
        FROM reservations
        WHERE branch_id = $1 
          AND reservation_date BETWEEN $2 AND $3
          AND status != 'cancelled'
        GROUP BY booking_type, hour, day_of_week, section, party_size
        ORDER BY hour
      `;

      const results = await getDatabase().query(query, [branchId, dateRange.startDate, dateRange.endDate]);

      // Get previous period for growth calculation
      const prevStartDate = new Date(dateRange.startDate.getTime() - (dateRange.endDate.getTime() - dateRange.startDate.getTime()));
      const prevQuery = `
        SELECT COUNT(*) as total_bookings FROM reservations
        WHERE branch_id = $1 
          AND reservation_date BETWEEN $2 AND $3
          AND status != 'cancelled'
      `;
      const prevResults = await getDatabase().query(prevQuery, [branchId, prevStartDate, dateRange.startDate]);
      const prevTotalBookings = parseInt(prevResults.rows[0]?.total_bookings || '0');

      // Aggregate results
      const bookingMetrics: BookingMetric = {
        totalBookings: 0,
        bookingsByType: { standard: 0, decorated: 0 },
        bookingsByTimeWindow: { morning: 0, afternoon: 0, evening: 0, lateNight: 0 },
        bookingsBySection: {},
        averagePartySize: 0,
        peakTimes: [],
        growthRate: prevTotalBookings > 0 ? ((results.rows.length - prevTotalBookings) / prevTotalBookings) * 100 : 0,
      };

      let totalPartySize = 0;
      let partyCount = 0;
      const hourMap: Record<number, number> = {};

      results.rows.forEach((row: any) => {
        const count = parseInt(row.total_bookings);
        bookingMetrics.totalBookings += count;

        // By type
        if (row.booking_type) {
          bookingMetrics.bookingsByType[row.booking_type as 'standard' | 'decorated'] = 
            (bookingMetrics.bookingsByType[row.booking_type as 'standard' | 'decorated'] || 0) + count;
        }

        // By section
        bookingMetrics.bookingsBySection[row.section] = 
          (bookingMetrics.bookingsBySection[row.section] || 0) + count;

        // By time window
        const hour = row.hour;
        hourMap[hour] = (hourMap[hour] || 0) + count;
        if (hour >= 6 && hour < 12) bookingMetrics.bookingsByTimeWindow.morning += count;
        else if (hour >= 12 && hour < 17) bookingMetrics.bookingsByTimeWindow.afternoon += count;
        else if (hour >= 17 && hour < 21) bookingMetrics.bookingsByTimeWindow.evening += count;
        else bookingMetrics.bookingsByTimeWindow.lateNight += count;

        // Party size
        totalPartySize += parseInt(row.party_size || '0') * count;
        partyCount += count;
      });

      bookingMetrics.averagePartySize = partyCount > 0 ? totalPartySize / partyCount : 0;
      bookingMetrics.peakTimes = Object.entries(hourMap)
        .map(([hour, count]) => ({ hour: parseInt(hour), bookings: count }))
        .sort((a, b) => b.bookings - a.bookings);

      // Cache the result
      await getRedis().setex(cacheKey, this.cacheExpiry, JSON.stringify(bookingMetrics));
      return bookingMetrics;
    } catch (error) {
      logger.error('Error fetching booking metrics', { branchId, dateRange, error });
      throw error;
    }
  }

  /**
   * Get no-show metrics for a branch
   */
  async getNoShowMetrics(branchId: string, dateRange: DateRange): Promise<NoShowMetric> {
    const cacheKey = `metrics:noshows:${branchId}:${dateRange.startDate.getTime()}:${dateRange.endDate.getTime()}`;

    try {
      const cached = await getRedis().get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get total reservations
      const totalQuery = `
        SELECT COUNT(*) as total FROM reservations
        WHERE branch_id = $1 
          AND reservation_date BETWEEN $2 AND $3
      `;
      const totalResults = await getDatabase().query(totalQuery, [branchId, dateRange.startDate, dateRange.endDate]);
      const totalReservations = parseInt(totalResults.rows[0].total);

      // Get no-shows
      const noShowQuery = `
        SELECT 
          COUNT(*) as no_show_count,
          booking_type,
          EXTRACT(HOUR FROM start_time) as hour,
          c.id as customer_id,
          c.name as customer_name
        FROM reservations r
        LEFT JOIN customers c ON r.customer_id = c.id
        WHERE r.branch_id = $1 
          AND r.reservation_date BETWEEN $2 AND $3
          AND r.status = 'no_show'
        GROUP BY booking_type, hour, c.id, c.name
        ORDER BY no_show_count DESC
      `;

      const noShowResults = await getDatabase().query(noShowQuery, [branchId, dateRange.startDate, dateRange.endDate]);

      const metrics: NoShowMetric = {
        totalNoShows: 0,
        noShowRate: 0,
        noShowsByBookingType: { standard: 0, decorated: 0 },
        noShowsByTimeWindow: { morning: 0, afternoon: 0, evening: 0, lateNight: 0 },
        chronicalOffenders: [],
      };

      const offenderMap: Record<string, { name: string; count: number }> = {};

      noShowResults.rows.forEach((row: any) => {
        const count = parseInt(row.no_show_count);
        metrics.totalNoShows += count;

        if (row.booking_type) {
          metrics.noShowsByBookingType[row.booking_type as 'standard' | 'decorated'] = 
            (metrics.noShowsByBookingType[row.booking_type as 'standard' | 'decorated'] || 0) + count;
        }

        const hour = row.hour;
        if (hour >= 6 && hour < 12) metrics.noShowsByTimeWindow.morning += count;
        else if (hour >= 12 && hour < 17) metrics.noShowsByTimeWindow.afternoon += count;
        else if (hour >= 17 && hour < 21) metrics.noShowsByTimeWindow.evening += count;
        else metrics.noShowsByTimeWindow.lateNight += count;

        if (row.customer_id) {
          offenderMap[row.customer_id] = {
            name: row.customer_name,
            count: offenderMap[row.customer_id]?.count + count || count,
          };
        }
      });

      metrics.noShowRate = totalReservations > 0 ? (metrics.totalNoShows / totalReservations) * 100 : 0;
      metrics.chronicalOffenders = Object.entries(offenderMap)
        .filter(([, data]) => data.count >= 3) // 3+ no-shows
        .map(([id, data]) => ({
          customerId: id,
          customerName: data.name,
          noShowCount: data.count,
        }))
        .sort((a, b) => b.noShowCount - a.noShowCount);

      await getRedis().setex(cacheKey, this.cacheExpiry, JSON.stringify(metrics));
      return metrics;
    } catch (error) {
      logger.error('Error fetching no-show metrics', { branchId, dateRange, error });
      throw error;
    }
  }

  /**
   * Get turnover metrics for a branch
   */
  async getTurnoverMetrics(branchId: string, dateRange: DateRange): Promise<TurnoverMetric> {
    const cacheKey = `metrics:turnover:${branchId}:${dateRange.startDate.getTime()}:${dateRange.endDate.getTime()}`;

    try {
      const cached = await getRedis().get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const query = `
        SELECT 
          COALESCE(section, 'Unknown') as section,
          EXTRACT(HOUR FROM start_time) as hour,
          AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) as avg_duration_minutes,
          COUNT(*) as table_count
        FROM reservations
        WHERE branch_id = $1 
          AND reservation_date BETWEEN $2 AND $3
          AND status IN ('completed', 'seated')
        GROUP BY section, hour
        ORDER BY hour
      `;

      const results = await getDatabase().query(query, [branchId, dateRange.startDate, dateRange.endDate]);

      const metrics: TurnoverMetric = {
        averageTurnaroundTime: 0,
        turnoverBySection: {},
        tablesPerHour: 0,
        sessionDurationAverage: 0,
        peakTurnoverHours: [],
        turnoverTrend: [],
      };

      let totalDuration = 0;
      let totalCount = 0;
      let totalTables = 0;
      const hourMap: Record<number, number> = {};

      results.rows.forEach((row: any) => {
        const duration = parseFloat(row.avg_duration_minutes || '0');
        const count = parseInt(row.table_count || '0');

        totalDuration += duration * count;
        totalCount += count;
        totalTables += count;

        metrics.turnoverBySection[row.section] = (metrics.turnoverBySection[row.section] || 0) + count;
        
        const hour = row.hour;
        hourMap[hour] = (hourMap[hour] || 0) + count;
      });

      metrics.sessionDurationAverage = totalCount > 0 ? totalDuration / totalCount : 0;
      metrics.averageTurnaroundTime = metrics.sessionDurationAverage + 15; // Add 15 min turnover time
      metrics.tablesPerHour = results.rows.length > 0 ? totalTables / results.rows.length : 0;
      metrics.peakTurnoverHours = Object.entries(hourMap)
        .map(([hour]) => parseInt(hour))
        .sort((a, b) => hourMap[b] - hourMap[a])
        .slice(0, 5);
      metrics.turnoverTrend = Object.entries(hourMap)
        .map(([hour, count]) => ({ hour: parseInt(hour), turnover: count }))
        .sort((a, b) => a.hour - b.hour);

      await getRedis().setex(cacheKey, this.cacheExpiry, JSON.stringify(metrics));
      return metrics;
    } catch (error) {
      logger.error('Error fetching turnover metrics', { branchId, dateRange, error });
      throw error;
    }
  }

  /**
   * Get promo code metrics for a branch
   */
  async getPromoMetrics(branchId: string, codeId?: string, dateRange?: DateRange): Promise<PromoMetric> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const range = dateRange || { startDate: thirtyDaysAgo, endDate: now };

    const cacheKey = `metrics:promo:${branchId}:${codeId || 'all'}:${range.startDate.getTime()}:${range.endDate.getTime()}`;

    try {
      const cached = await getRedis().get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      let promoQuery = `
        SELECT 
          r.promo_code,
          pc.type,
          COUNT(r.id) as usage_count,
          SUM(COALESCE(r.promo_code_discount, 0)) as total_discount,
          SUM(COALESCE(r.total_amount, 0)) as revenue
        FROM reservations r
        LEFT JOIN promo_codes pc ON r.promo_code = pc.code
        WHERE r.branch_id = $1 
          AND r.reservation_date BETWEEN $2 AND $3
          AND r.promo_code IS NOT NULL
      `;

      const params: any[] = [branchId, range.startDate, range.endDate];

      if (codeId) {
        promoQuery += ` AND pc.id = $4`;
        params.push(codeId);
      }

      promoQuery += ` GROUP BY r.promo_code, pc.type ORDER BY usage_count DESC`;

      const results = await getDatabase().query(promoQuery, params);

      // Get total bookings for conversion rate
      const totalQuery = `
        SELECT COUNT(*) as total FROM reservations
        WHERE branch_id = $1 
          AND reservation_date BETWEEN $2 AND $3
      `;
      const totalResults = await getDatabase().query(totalQuery, [branchId, range.startDate, range.endDate]);
      const totalBookings = parseInt(totalResults.rows[0].total);

      const metrics: PromoMetric = {
        totalPromoUse: 0,
        promosByType: {},
        totalDiscountGiven: 0,
        averageDiscountPerBooking: 0,
        conversionRate: 0,
        roiByPromo: [],
        topPerformingPromos: [],
      };

      results.rows.forEach((row: any) => {
        const usage = parseInt(row.usage_count);
        const discount = parseFloat(row.total_discount || '0');
        const revenue = parseFloat(row.revenue || '0');

        metrics.totalPromoUse += usage;
        metrics.totalDiscountGiven += discount;

        if (row.type) {
          metrics.promosByType[row.type] = (metrics.promosByType[row.type] || 0) + usage;
        }

        const roi = revenue > 0 ? ((revenue - discount) / discount) * 100 : 0;
        metrics.roiByPromo.push({
          promoCode: row.promo_code,
          revenue,
          discount,
          roi,
        });
      });

      metrics.averageDiscountPerBooking = metrics.totalPromoUse > 0 ? metrics.totalDiscountGiven / metrics.totalPromoUse : 0;
      metrics.conversionRate = totalBookings > 0 ? (metrics.totalPromoUse / totalBookings) * 100 : 0;
      metrics.topPerformingPromos = metrics.roiByPromo
        .sort((a, b) => b.roi - a.roi)
        .slice(0, 5)
        .map(p => p.promoCode);

      await getRedis().setex(cacheKey, this.cacheExpiry, JSON.stringify(metrics));
      return metrics;
    } catch (error) {
      logger.error('Error fetching promo metrics', { branchId, codeId, dateRange, error });
      throw error;
    }
  }

  /**
   * Get revenue metrics for a branch
   */
  async getRevenueMetrics(branchId: string, dateRange: DateRange): Promise<RevenueMetric> {
    const cacheKey = `metrics:revenue:${branchId}:${dateRange.startDate.getTime()}:${dateRange.endDate.getTime()}`;

    try {
      const cached = await getRedis().get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const query = `
        SELECT 
          SUM(COALESCE(r.total_amount, 0)) as total_revenue,
          SUM(COALESCE(r.deposit_amount, 0)) as total_deposits,
          SUM(COALESCE(r.promo_code_discount, 0)) as total_discounts,
          r.booking_type,
          COALESCE(r.section, 'Unknown') as section,
          r.promo_code
        FROM reservations r
        WHERE r.branch_id = $1 
          AND r.reservation_date BETWEEN $2 AND $3
          AND r.status != 'cancelled'
        GROUP BY r.booking_type, r.section, r.promo_code
      `;

      const results = await getDatabase().query(query, [branchId, dateRange.startDate, dateRange.endDate]);

      // Get previous period for growth
      const prevStartDate = new Date(dateRange.startDate.getTime() - (dateRange.endDate.getTime() - dateRange.startDate.getTime()));
      const prevQuery = `
        SELECT SUM(COALESCE(total_amount, 0)) as total_revenue FROM reservations
        WHERE branch_id = $1 
          AND reservation_date BETWEEN $2 AND $3
          AND status != 'cancelled'
      `;
      const prevResults = await getDatabase().query(prevQuery, [branchId, prevStartDate, dateRange.startDate]);
      const prevRevenue = parseFloat(prevResults.rows[0].total_revenue || '0');

      // Get table count for revenue per table
      const tableQuery = `SELECT COUNT(*) as table_count FROM tables WHERE branch_id = $1`;
      const tableResults = await getDatabase().query(tableQuery, [branchId]);
      const tableCount = parseInt(tableResults.rows[0].table_count || '1');

      const metrics: RevenueMetric = {
        totalRevenue: 0,
        totalDeposits: 0,
        totalDiscounts: 0,
        netRevenue: 0,
        revenueByBookingType: { standard: 0, decorated: 0 },
        revenueBySection: {},
        revenuePerTable: 0,
        revenueGrowthRate: prevRevenue > 0 ? ((0 - prevRevenue) / prevRevenue) * 100 : 0,
        revenueByPromo: {},
      };

      results.rows.forEach((row: any) => {
        const revenue = parseFloat(row.total_revenue || '0');
        const deposits = parseFloat(row.total_deposits || '0');
        const discounts = parseFloat(row.total_discounts || '0');

        metrics.totalRevenue += revenue;
        metrics.totalDeposits += deposits;
        metrics.totalDiscounts += discounts;

        if (row.booking_type) {
          metrics.revenueByBookingType[row.booking_type as 'standard' | 'decorated'] = 
            (metrics.revenueByBookingType[row.booking_type as 'standard' | 'decorated'] || 0) + revenue;
        }

        metrics.revenueBySection[row.section] = 
          (metrics.revenueBySection[row.section] || 0) + revenue;

        if (row.promo_code) {
          metrics.revenueByPromo[row.promo_code] = 
            (metrics.revenueByPromo[row.promo_code] || 0) + revenue;
        }
      });

      metrics.netRevenue = metrics.totalRevenue - metrics.totalDiscounts;
      metrics.revenuePerTable = tableCount > 0 ? metrics.netRevenue / tableCount : 0;
      metrics.revenueGrowthRate = prevRevenue > 0 ? ((metrics.totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

      await getRedis().setex(cacheKey, this.cacheExpiry, JSON.stringify(metrics));
      return metrics;
    } catch (error) {
      logger.error('Error fetching revenue metrics', { branchId, dateRange, error });
      throw error;
    }
  }

  /**
   * Clear cache for a branch (call when data changes)
   */
  async clearCache(branchId: string): Promise<void> {
    try {
      const pattern = `metrics:*:${branchId}:*`;
      const keys = await getRedis().keys(pattern);
      if (keys.length > 0) {
        await getRedis().del(...keys);
      }
    } catch (error) {
      logger.error('Error clearing metrics cache', { branchId, error });
    }
  }
}

export const metricsService = new MetricsService();
