async function findFirstExistingColumn(pool, tableName, columnCandidates) {
  const result = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = ANY($2)
      ORDER BY array_position($2::text[], column_name)
      LIMIT 1;
    `,
    [tableName, columnCandidates],
  );

  return result.rowCount > 0 ? result.rows[0].column_name : null;
}

async function findExistingColumns(pool, tableName, columnCandidates) {
  const result = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = ANY($2)
      ORDER BY array_position($2::text[], column_name);
    `,
    [tableName, columnCandidates],
  );

  return result.rows.map((row) => row.column_name);
}

module.exports = {
  findFirstExistingColumn,
  findExistingColumns,
};
