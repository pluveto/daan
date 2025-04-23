import { McpServer } from '@moinfra/mcp-client-sdk/server/mcp.js';
import { Implementation, TextContent } from '@moinfra/mcp-client-sdk/types.js';
import {
  formatInTimeZone,
  fromZonedTime,
  getTimezoneOffset,
  toZonedTime,
} from 'date-fns-tz';
import { z } from 'zod';

enum TimeTools {
  GET_CURRENT_TIME = 'get_current_time',
  CONVERT_TIME = 'convert_time',
}

const serverInfo: Implementation = {
  name: 'Daan Time Server',
  version: '1.0.0',
};

class TimeServerImpl {
  getCurrentTime(timezoneName: string): {
    timezone: string;
    datetime: string;
    is_dst: boolean;
  } {
    try {
      const now = new Date();
      const formattedDateTime = formatInTimeZone(
        now,
        timezoneName,
        "yyyy-MM-dd'T'HH:mm:ssXXX",
      );
      const offset = getTimezoneOffset(timezoneName, now);
      // While `date-fns-tz` doesn't directly expose a boolean for DST,
      // we can infer it by comparing the offset at two different times of the year.
      const nonDstOffset = getTimezoneOffset(
        timezoneName,
        new Date(now.getFullYear(), 0, 1),
      ); // January 1st
      const isDst = offset !== nonDstOffset;

      return {
        timezone: timezoneName,
        datetime: formattedDateTime,
        is_dst: isDst,
      };
    } catch (e: any) {
      throw new Error(`Invalid timezone: ${e.message}`);
    }
  }

  convertTime(
    sourceTz: string,
    timeStr: string,
    targetTz: string,
  ): {
    source: { timezone: string; datetime: string; is_dst: boolean };
    target: { timezone: string; datetime: string; is_dst: boolean };
    time_difference: string;
  } {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      if (
        isNaN(hours) ||
        isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
      ) {
        throw new Error('Invalid time format. Expected HH:MM [24-hour format]');
      }

      const now = new Date();
      const sourceZonedDate = toZonedTime(now, sourceTz);
      const sourceDateTime = new Date(
        sourceZonedDate.getFullYear(),
        sourceZonedDate.getMonth(),
        sourceZonedDate.getDate(),
        hours,
        minutes,
        0,
        0,
      );
      const utcSourceTime = fromZonedTime(sourceDateTime, sourceTz);
      const targetZonedTime = toZonedTime(utcSourceTime, targetTz);

      const formattedSourceTime = formatInTimeZone(
        sourceDateTime,
        sourceTz,
        "yyyy-MM-dd'T'HH:mm:ssXXX",
      );
      const formattedTargetTime = formatInTimeZone(
        utcSourceTime,
        targetTz,
        "yyyy-MM-dd'T'HH:mm:ssXXX",
      );

      const sourceOffset =
        getTimezoneOffset(sourceTz, sourceDateTime) / (60 * 60 * 1000);
      const targetOffset =
        getTimezoneOffset(targetTz, targetZonedTime) / (60 * 60 * 1000);
      const timeDifferenceHours = targetOffset - sourceOffset;

      const sourceNonDstOffset =
        getTimezoneOffset(
          sourceTz,
          new Date(sourceDateTime.getFullYear(), 0, 1),
        ) !== getTimezoneOffset(sourceTz, sourceDateTime);
      const targetNonDstOffset =
        getTimezoneOffset(
          targetTz,
          new Date(targetZonedTime.getFullYear(), 0, 1),
        ) !== getTimezoneOffset(targetTz, targetZonedTime);

      const formatTimeDifference = (diff: number): string => {
        if (Number.isInteger(diff)) {
          return `${diff > 0 ? '+' : ''}${diff}.0h`;
        } else {
          const formatted = diff
            .toFixed(2)
            .replace(/0$/, '')
            .replace(/\.$/, '');
          return `${formatted}h`;
        }
      };

      return {
        source: {
          timezone: sourceTz,
          datetime: formattedSourceTime,
          is_dst: sourceNonDstOffset,
        },
        target: {
          timezone: targetTz,
          datetime: formattedTargetTime,
          is_dst: targetNonDstOffset,
        },
        time_difference: formatTimeDifference(timeDifferenceHours),
      };
    } catch (e: any) {
      if (e.message.startsWith('Invalid time format')) {
        throw e;
      } else {
        throw new Error(`Invalid timezone: ${e.message}`);
      }
    }
  }
}

// Function to create and configure the Time Server instance
export function createBuiltinTimeServer(): McpServer {
  console.log('Creating Time MCP Server...');
  const server = new McpServer(serverInfo);
  const timeServerImpl = new TimeServerImpl();
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  server.tool(
    TimeTools.GET_CURRENT_TIME,
    'Get current time in a specific timezone',
    {
      timezone: z
        .string()
        .describe(
          `IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Use '${localTz}' as local timezone if no timezone provided by the user.`,
        ),
    },
    async ({
      timezone,
    }): Promise<{ content: TextContent[]; isError?: boolean }> => {
      const tz = timezone || localTz;
      try {
        const result = timeServerImpl.getCurrentTime(tz);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error('[Time MCP Server] Get current time error:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error getting current time: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    TimeTools.CONVERT_TIME,
    'Convert time between timezones',
    {
      source_timezone: z
        .string()
        .describe(
          `Source IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Use '${localTz}' as local timezone if no source timezone provided by the user.`,
        ),
      time: z.string().describe('Time to convert in 24-hour format (HH:MM)'),
      target_timezone: z
        .string()
        .describe(
          `Target IANA timezone name (e.g., 'Asia/Tokyo', 'America/San_Francisco'). Use '${localTz}' as local timezone if no target timezone provided by the user.`,
        ),
    },
    async ({
      source_timezone,
      time,
      target_timezone,
    }): Promise<{ content: TextContent[]; isError?: boolean }> => {
      const sourceTz = source_timezone || localTz;
      const targetTz = target_timezone || localTz;
      try {
        const result = timeServerImpl.convertTime(sourceTz, time, targetTz);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error('[Time MCP Server] Convert time error:', error);
        return {
          content: [
            { type: 'text', text: `Error converting time: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  );

  console.log('Time MCP Server tools registered.');

  return server;
}

// Optional: Atom to hold the singleton instance of the server
// import { atom } from 'jotai';
// export const timeServerAtom = atom<McpServer | null>(null);
// export const initializeTimeServerAtom = atom(null, (get, set) => {
//   if (!get(timeServerAtom)) {
//     set(timeServerAtom, createTimeServer());
//   }
// });
